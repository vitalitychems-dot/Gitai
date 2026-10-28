import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import {
  createPrivateRepositoryArchive,
  type ArchiveScope,
  type SnapshotObjectDriver,
  type SnapshotObjectMetadata,
} from "./private-repository-archive";

const MAX_SNAPSHOT_BYTES = 17 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const STORAGE_REVISION = /^[A-Za-z0-9._/+=-]{1,128}$/;
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const SYNTHETIC_KEY =
  /^gitai\/repository-snapshots\/v1\/verification\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{64}\.json$/;

type ObjectKey = { Bucket: string; Key: string };

export type R2ObjectTransport = {
  putObject(
    input: ObjectKey & {
      Body: Buffer;
      CacheControl: string;
      ContentLength: number;
      ContentType: string;
      IfNoneMatch: "*";
      Metadata: Record<string, string>;
    },
    signal: AbortSignal,
  ): Promise<{ ETag?: string }>;
  headObject(
    input: ObjectKey,
    signal: AbortSignal,
  ): Promise<{ ContentLength?: number; ETag?: string; Metadata?: Record<string, string> }>;
  getObject(
    input: ObjectKey & { IfMatch: string },
    signal: AbortSignal,
  ): Promise<{ Body?: unknown; ContentLength?: number; ETag?: string }>;
  deleteObject(input: ObjectKey, signal: AbortSignal): Promise<void>;
};

function unavailable(): never {
  throw new Error("Private R2 repository archive is unavailable.");
}

function requestSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function statusCode(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  if ("$metadata" in error && error.$metadata && typeof error.$metadata === "object" &&
      "httpStatusCode" in error.$metadata) {
    return Number(error.$metadata.httpStatusCode) || 0;
  }
  if ("code" in error) return Number(error.code) || 0;
  return 0;
}

function revision(etag: string | undefined) {
  const token = etag?.trim().replace(/^"(.*)"$/, "$1");
  if (!token || !STORAGE_REVISION.test(token)) return unavailable();
  return token;
}

function isAsyncByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return Boolean(value && typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function");
}

async function readBoundedBody(body: unknown, signal: AbortSignal): Promise<Buffer> {
  if (!isAsyncByteStream(body)) return unavailable();
  if (signal.aborted) return unavailable();
  const chunks: Buffer[] = [];
  let length = 0;
  const stream = body as AsyncIterable<Uint8Array> & { destroy?: () => void };
  const stop = () => {
    if (typeof stream.destroy === "function") stream.destroy.call(stream);
  };
  const consume = async () => {
    try {
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) return unavailable();
        length += chunk.byteLength;
        if (length > MAX_SNAPSHOT_BYTES) {
          stop();
          return unavailable();
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch {
      return unavailable();
    }
    if (!length) return unavailable();
    return Buffer.concat(chunks, length);
  };
  let rejectAbort!: (reason?: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    stop();
    rejectAbort(new Error("R2 object read timed out."));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([consume(), aborted]);
  } catch {
    return unavailable();
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

const r2MetadataShape = z.object({
  gitaiRepositoryId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  gitaiSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  gitaiSnapshotVersion: z.enum(["1", "2"]),
  gitaiScope: z.enum(["production", "development", "verification", "test"]),
}).strict();

export function createR2SnapshotDriver(
  { bucket, scope, transport }: { bucket: string; scope: ArchiveScope; transport: R2ObjectTransport },
): SnapshotObjectDriver {
  if (!BUCKET_NAME.test(bucket)) return unavailable();
  return {
    async create(name, bytes, metadata) {
      try {
        const result = await transport.putObject({
          Bucket: bucket,
          Key: name,
          Body: Buffer.from(bytes),
          CacheControl: metadata.cacheControl,
          ContentLength: bytes.byteLength,
          ContentType: metadata.contentType,
          IfNoneMatch: "*",
          Metadata: {
            gitairepositoryid: metadata.custom.gitaiRepositoryId,
            gitaisnapshotsha256: metadata.custom.gitaiSnapshotSha256,
            gitaisnapshotversion: metadata.custom.gitaiSnapshotVersion,
            gitaiscope: metadata.custom.gitaiScope,
          },
        }, requestSignal());
        return { generation: revision(result.ETag) };
      } catch (error) {
        const status = statusCode(error);
        if (status === 409 || status === 412) {
          throw Object.assign(new Error("Private archive object already exists."), { code: status });
        }
        return unavailable();
      }
    },

    async read(name) {
      try {
        const key = { Bucket: bucket, Key: name };
        const head = await transport.headObject(key, requestSignal());
        const etag = head.ETag;
        const currentRevision = revision(etag);
        const expectedLength = Number(head.ContentLength);
        if (!Number.isSafeInteger(expectedLength) || expectedLength < 1 ||
            expectedLength > MAX_SNAPSHOT_BYTES || !head.Metadata) {
          return unavailable();
        }

        const signal = requestSignal();
        const result = await transport.getObject({ ...key, IfMatch: etag! }, signal);
        if (revision(result.ETag) !== currentRevision ||
            (result.ContentLength !== undefined && result.ContentLength !== expectedLength)) {
          return unavailable();
        }
        const bytes = await readBoundedBody(result.Body, signal);
        if (bytes.byteLength !== expectedLength) return unavailable();
        const acceptedMetadata = r2MetadataShape.safeParse({
          gitaiRepositoryId: head.Metadata?.gitairepositoryid,
          gitaiSnapshotSha256: head.Metadata?.gitaisnapshotsha256,
          gitaiSnapshotVersion: head.Metadata?.gitaisnapshotversion,
          gitaiScope: head.Metadata?.gitaiscope,
        });
        if (!acceptedMetadata.success) return unavailable();
        return {
          bytes,
          generation: currentRevision,
          metadata: acceptedMetadata.data,
        };
      } catch {
        return unavailable();
      }
    },

    async remove(name, expectedRevision) {
      if (scope !== "verification" || !SYNTHETIC_KEY.test(name) ||
          !STORAGE_REVISION.test(expectedRevision)) return unavailable();
      try {
        const key = { Bucket: bucket, Key: name };
        const head = await transport.headObject(key, requestSignal());
        if (revision(head.ETag) !== expectedRevision) return unavailable();
        // R2 has no native object-version API. Deletion is limited to a random,
        // verification-only key after an ETag check; production objects are append-only.
        await transport.deleteObject(key, requestSignal());
      } catch {
        return unavailable();
      }
    },
  };
}

function configuredR2() {
  const accountId = process.env.GITAI_R2_ACCOUNT_ID?.trim().toLowerCase();
  const bucket = process.env.GITAI_R2_BUCKET?.trim();
  const accessKeyId = process.env.GITAI_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.GITAI_R2_SECRET_ACCESS_KEY;
  if (!accountId || !ACCOUNT_ID.test(accountId) ||
      !bucket || !BUCKET_NAME.test(bucket) ||
      !accessKeyId || !secretAccessKey) return unavailable();

  const client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5_000, requestTimeout: REQUEST_TIMEOUT_MS },
  });

  const transport: R2ObjectTransport = {
    putObject: (input, signal) => client.send(new PutObjectCommand(input), { abortSignal: signal }),
    headObject: (input, signal) => client.send(new HeadObjectCommand(input), { abortSignal: signal }),
    getObject: (input, signal) => client.send(new GetObjectCommand(input), { abortSignal: signal }),
    deleteObject: async (input, signal) => {
      await client.send(new DeleteObjectCommand(input), { abortSignal: signal });
    },
  };
  return { bucket, transport };
}

export function openConfiguredPrivateR2RepositoryArchive(
  scope: ArchiveScope = process.env.NODE_ENV === "production" ? "production" : "development",
) {
  const { bucket, transport } = configuredR2();
  return createPrivateRepositoryArchive({
    directory: `/${bucket}`,
    scope,
    driver: createR2SnapshotDriver({ bucket, scope, transport }),
  });
}
