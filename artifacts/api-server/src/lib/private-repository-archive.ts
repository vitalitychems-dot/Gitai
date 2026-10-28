import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { appStorageClient } from "./app-storage-client";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PACK_BYTES = 12 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 17 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_PACK_BYTES / 3) * 4;

const snapshotShape = z.object({
  version: z.literal(1),
  repositoryId: z.string().regex(UUID),
  createdAt: z.iso.datetime(),
  main: z.string().regex(/^[a-f0-9]{40}$/),
  packSha256: z.string().regex(SHA256),
  pack: z.string().min(4).max(MAX_BASE64_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();

export type ArchiveScope = "production" | "development" | "verification" | "test";

export type SnapshotObjectMetadata = {
  contentType: "application/json";
  cacheControl: "private, no-store";
  custom: {
    gitaiRepositoryId: string;
    gitaiSnapshotSha256: string;
    gitaiSnapshotVersion: "1";
    gitaiScope: ArchiveScope;
  };
};

export type SnapshotObjectDriver = {
  create(name: string, bytes: Buffer, metadata: SnapshotObjectMetadata): Promise<{ generation: string }>;
  read(name: string): Promise<{
    bytes: Buffer;
    generation: string;
    metadata: SnapshotObjectMetadata["custom"];
  }>;
  remove?(name: string, generation: string): Promise<void>;
};

export type SnapshotReceipt = {
  repositoryId: string;
  sha256: string;
  bytes: number;
  generation: string;
  scope: ArchiveScope;
  created: boolean;
};

function fail(message = "Private repository archive is unavailable."): never {
  throw new Error(message);
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateDocument(expectedId: string, input: Uint8Array) {
  if (!UUID.test(expectedId) || input.byteLength > MAX_SNAPSHOT_BYTES) fail("Invalid private archive identity or size.");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(input).toString("utf8")); }
  catch { fail("Invalid private archive document."); }
  const result = snapshotShape.safeParse(parsed);
  if (!result.success || result.data.repositoryId !== expectedId) fail("Invalid private archive identity or schema.");
  const pack = Buffer.from(result.data.pack, "base64");
  if (!pack.length || pack.length > MAX_PACK_BYTES ||
      pack.toString("base64") !== result.data.pack ||
      sha256(pack) !== result.data.packSha256) {
    fail("Private archive integrity verification failed.");
  }
  const bytes = Buffer.from(input);
  return { bytes, sha: sha256(bytes), repositoryId: expectedId };
}

function validatePrivateDirectory(raw: string | undefined) {
  const normalized = raw?.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("\\") || normalized.includes("?") || normalized.includes("#")) {
    fail("Private App Storage is not configured.");
  }
  const [bucketName, ...prefixParts] = normalized.split("/");
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucketName) ||
      prefixParts.some(part => !/^[A-Za-z0-9._-]{1,200}$/.test(part) || part === "." || part === "..")) {
    fail("Private App Storage path is invalid.");
  }
  return { bucketName, prefix: prefixParts.join("/") };
}

export function createPrivateRepositoryArchive(
  { directory, scope, driver }: { directory: string; scope: ArchiveScope; driver: SnapshotObjectDriver },
) {
  if (!["production", "development", "verification", "test"].includes(scope)) {
    fail("Private archive scope is invalid.");
  }
  const { prefix } = validatePrivateDirectory(directory);
  const objectName = (repositoryId: string, snapshotHash: string) => {
    if (!UUID.test(repositoryId) || !SHA256.test(snapshotHash)) fail("Invalid private archive identity.");
    return [
      prefix,
      "gitai",
      "repository-snapshots",
      "v1",
      scope,
      repositoryId,
      `${snapshotHash}.json`,
    ].filter(Boolean).join("/");
  };
  const expectedMetadata = (repositoryId: string, snapshotHash: string): SnapshotObjectMetadata["custom"] => ({
    gitaiRepositoryId: repositoryId,
    gitaiSnapshotSha256: snapshotHash,
    gitaiSnapshotVersion: "1",
    gitaiScope: scope,
  });

  async function get(repositoryId: string, snapshotHash: string) {
    const key = objectName(repositoryId, snapshotHash);
    let remote: Awaited<ReturnType<SnapshotObjectDriver["read"]>>;
    try { remote = await driver.read(key); }
    catch { return fail(); }
    const expected = expectedMetadata(repositoryId, snapshotHash);
    if (Object.keys(expected).some(k => remote.metadata[k as keyof typeof expected] !== expected[k as keyof typeof expected])) {
      return fail("Private repository archive metadata failed verification.");
    }
    const local = validateDocument(repositoryId, remote.bytes);
    if (local.sha !== snapshotHash) fail("Private repository archive digest failed verification.");
    return { bytes: local.bytes, generation: remote.generation };
  }

  return {
    async put(repositoryId: string, document: Uint8Array): Promise<SnapshotReceipt> {
      const local = validateDocument(repositoryId, document);
      const key = objectName(repositoryId, local.sha);
      const metadata: SnapshotObjectMetadata = {
        contentType: "application/json",
        cacheControl: "private, no-store",
        custom: expectedMetadata(repositoryId, local.sha),
      };
      try {
        const stored = await driver.create(key, local.bytes, metadata);
        return {
          repositoryId,
          sha256: local.sha,
          bytes: local.bytes.length,
          generation: stored.generation,
          scope,
          created: true,
        };
      } catch (error) {
        const status = error && typeof error === "object" && "code" in error ? Number(error.code) : 0;
        if (status !== 412 && status !== 409) {
          if (scope === "verification" && driver.remove) {
            try {
              const orphan = await get(repositoryId, local.sha);
              if (orphan.bytes.equals(local.bytes)) await driver.remove(key, orphan.generation);
            } catch { /* A failed write may have left no object to clean up. */ }
          }
          return fail();
        }
        // A deterministic content key makes retries idempotent. Only return an
        // existing receipt after reading and independently hashing its contents.
        const existing = await get(repositoryId, local.sha);
        if (!existing.bytes.equals(local.bytes)) fail("Private repository archive conflicts with an existing object.");
        return {
          repositoryId,
          sha256: local.sha,
          bytes: local.bytes.length,
          generation: existing.generation,
          scope,
          created: false,
        };
      }
    },
    get,
    async removeVerification(receipt: SnapshotReceipt): Promise<void> {
      if (scope !== "verification" || !driver.remove ||
          receipt.scope !== "verification" || !UUID.test(receipt.repositoryId) ||
          !SHA256.test(receipt.sha256) || !/^[1-9][0-9]*$/.test(receipt.generation)) {
        fail("Only a verified synthetic archive may be removed by the verification tool.");
      }
      const key = objectName(receipt.repositoryId, receipt.sha256);
      try { await driver.remove(key, receipt.generation); }
      catch { fail(); }
    },
  };
}

function gcsSnapshotDriver(bucketName: string): SnapshotObjectDriver {
  const bucket = appStorageClient.bucket(bucketName);
  return {
    async create(name, bytes, metadata) {
      const file = bucket.file(name);
      try {
        await file.save(bytes, {
          resumable: false,
          validation: "crc32c",
          timeout: 30_000,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: metadata.contentType,
            cacheControl: metadata.cacheControl,
            metadata: metadata.custom,
          },
        });
      } catch (error) {
        const status = error && typeof error === "object" && "code" in error ? Number(error.code) : 0;
        if (status === 412 || status === 409) throw Object.assign(new Error("exists"), { code: status });
        fail();
      }
      try {
        const [result] = await file.getMetadata();
        if (!/^[1-9][0-9]*$/.test(String(result.generation))) fail();
        return { generation: String(result.generation) };
      } catch { return fail(); }
    },
    async read(name) {
      try {
        const file = bucket.file(name);
        const [metadata] = await file.getMetadata();
        const byteLength = Number(metadata.size);
        if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_SNAPSHOT_BYTES ||
            !/^[1-9][0-9]*$/.test(String(metadata.generation))) fail();
        const generation = String(metadata.generation);
        const versionedFile = bucket.file(name, { generation });
        const [bytes] = await versionedFile.download({ validation: "crc32c" });
        const custom = metadata.metadata ?? {};
        const accepted = z.object({
          gitaiRepositoryId: z.string().regex(UUID),
          gitaiSnapshotSha256: z.string().regex(SHA256),
          gitaiSnapshotVersion: z.literal("1"),
          gitaiScope: z.enum(["production", "development", "verification", "test"]),
        }).strict().safeParse(custom);
        if (!accepted.success || bytes.length !== byteLength) fail();
        return { bytes, generation, metadata: accepted.data };
      } catch { return fail(); }
    },
    async remove(name, generation) {
      if (!/^[1-9][0-9]*$/.test(generation)) fail();
      try { await bucket.file(name, { generation }).delete(); }
      catch { return fail(); }
    },
  };
}

export function openConfiguredPrivateRepositoryArchive(scope: ArchiveScope = process.env.NODE_ENV === "production" ? "production" : "development") {
  const rawDirectory = process.env.PRIVATE_OBJECT_DIR;
  const { bucketName } = validatePrivateDirectory(rawDirectory);
  return createPrivateRepositoryArchive({
    directory: rawDirectory!,
    scope,
    driver: gcsSnapshotDriver(bucketName),
  });
}
