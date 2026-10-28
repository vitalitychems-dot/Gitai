import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPrivateRepositoryArchive } from "../lib/private-repository-archive";
import { createR2SnapshotDriver, type R2ObjectTransport } from "../lib/r2-repository-archive";

function makeSnapshot(repositoryId: string) {
  const pack = Buffer.from("synthetic-r2-pack");
  return Buffer.from(JSON.stringify({
    version: 2,
    repositoryId,
    createdAt: "2026-01-01T00:00:00.000Z",
    main: "a".repeat(40),
    packSha256: createHash("sha256").update(pack).digest("hex"),
    pack: pack.toString("base64"),
    proposals: {},
  }));
}

function fixture(options: { badGetEtag?: boolean; oversizedHead?: boolean } = {}) {
  const objects = new Map<string, {
    bytes: Buffer;
    etag: string;
    metadata: Record<string, string>;
  }>();
  const putInputs: Parameters<R2ObjectTransport["putObject"]>[0][] = [];
  let deleteCount = 0;
  const transport: R2ObjectTransport = {
    async putObject(input) {
      putInputs.push(input);
      if (objects.has(input.Key)) throw Object.assign(new Error("exists"), { code: 412 });
      const etag = `"etag-${objects.size + 1}"`;
      objects.set(input.Key, {
        bytes: Buffer.from(input.Body),
        etag,
        metadata: { ...input.Metadata },
      });
      return { ETag: etag };
    },
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw Object.assign(new Error("missing"), { code: 404 });
      return {
        ContentLength: options.oversizedHead ? 17 * 1024 * 1024 + 1 : object.bytes.length,
        ETag: object.etag,
        Metadata: { ...object.metadata },
      };
    },
    async getObject({ Key, IfMatch }) {
      const object = objects.get(Key);
      if (!object || object.etag !== IfMatch) {
        throw Object.assign(new Error("precondition"), { code: 412 });
      }
      const stored = object;
      async function* stream() {
        yield stored.bytes.subarray(0, 13);
        yield stored.bytes.subarray(13);
      }
      return {
        Body: stream(),
        ContentLength: stored.bytes.length,
        ETag: options.badGetEtag ? '"etag-unexpected"' : stored.etag,
      };
    },
    async deleteObject({ Key }) {
      deleteCount += 1;
      objects.delete(Key);
    },
  };
  const archive = (scope: "verification" | "production" = "verification") =>
    createPrivateRepositoryArchive({
      directory: "/r2-test-bucket",
      scope,
      driver: createR2SnapshotDriver({ bucket: "r2-test-bucket", scope, transport }),
    });
  return { archive, objects, putInputs, getDeleteCount: () => deleteCount };
}

test("R2 archive creates immutable objects and verifies matching ETag content", async () => {
  const { archive, objects, putInputs, getDeleteCount } = fixture();
  const repo = randomUUID();
  const doc = makeSnapshot(repo);
  const store = archive();
  const first = await store.put(repo, doc);
  const prettyJson = Buffer.from(JSON.stringify(JSON.parse(doc.toString("utf8")), null, 2));
  const retry = await store.put(repo, prettyJson);

  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.generation, first.generation);
  assert.equal(putInputs.length, 2);
  assert.equal(putInputs[0].IfNoneMatch, "*");
  assert.equal(putInputs[0].CacheControl, "private, no-store");
  assert.equal(putInputs[0].ContentType, "application/json");
  assert.equal(objects.size, 1);
  const [key] = [...objects.keys()];
  assert.match(key, new RegExp(`^gitai/repository-snapshots/v1/verification/${repo}/[a-f0-9]{64}\\.json$`));

  const restored = await store.get(repo, first.sha256);
  assert.equal(restored.generation, first.generation);
  assert.equal(createHash("sha256").update(restored.bytes).digest("hex"), first.sha256);
  await store.removeVerification(first);
  assert.equal(getDeleteCount(), 1);
  assert.equal(objects.size, 0);
});

test("R2 reads reject changed ETags and oversized objects before download", async () => {
  const mismatch = fixture({ badGetEtag: true });
  const repo = randomUUID();
  const receipt = await mismatch.archive().put(repo, makeSnapshot(repo));
  await assert.rejects(mismatch.archive().get(repo, receipt.sha256), /unavailable/);

  const oversized = fixture({ oversizedHead: true });
  const largeRepo = randomUUID();
  const largeReceipt = await oversized.archive().put(largeRepo, makeSnapshot(largeRepo));
  await assert.rejects(oversized.archive().get(largeRepo, largeReceipt.sha256), /unavailable/);
});

test("R2 verification deletion cannot target production or arbitrary object keys", async () => {
  const { archive, objects, getDeleteCount } = fixture();
  const repo = randomUUID();
  const production = archive("production");
  const receipt = await production.put(repo, makeSnapshot(repo));
  await assert.rejects(production.removeVerification(receipt), /verified synthetic archive/);
  assert.equal(getDeleteCount(), 0);
  assert.equal(objects.size, 1);
});
