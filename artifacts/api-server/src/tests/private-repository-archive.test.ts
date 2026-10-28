import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPrivateRepositoryArchive,
  type SnapshotObjectDriver,
  type SnapshotObjectMetadata,
} from "../lib/private-repository-archive";

function makeSnapshot(repositoryId: string, pack = Buffer.from("synthetic-pack")) {
  return Buffer.from(JSON.stringify({
    version: 1,
    repositoryId,
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    main: "a".repeat(40),
    packSha256: createHash("sha256").update(pack).digest("hex"),
    pack: pack.toString("base64"),
  }));
}

function fixture() {
  const objects = new Map<string, {
    bytes: Buffer;
    generation: string;
    custom: SnapshotObjectMetadata["custom"];
  }>();
  let createCalls = 0;
  const driver: SnapshotObjectDriver = {
    async create(name, bytes, metadata) {
      createCalls += 1;
      if (objects.has(name)) throw Object.assign(new Error("precondition"), { code: 412 });
      const generation = String(createCalls);
      objects.set(name, { bytes: Buffer.from(bytes), generation, custom: metadata.custom });
      return { generation };
    },
    async read(name) {
      const item = objects.get(name);
      if (!item) throw new Error("not found");
      return { ...item, bytes: Buffer.from(item.bytes), metadata: { ...item.custom } };
    },
    async remove(name, generation) {
      if (objects.get(name)?.generation === generation) objects.delete(name);
    },
  };
  const archive = createPrivateRepositoryArchive({
    directory: "/test-bucket/.private-data",
    scope: "verification",
    driver,
  });
  return { archive, objects, driver, getCreateCalls: () => createCalls };
}

test("private archives are immutable, tenant-scoped and retry-idempotent", async () => {
  const { archive, objects, getCreateCalls } = fixture();
  const repositoryId = randomUUID();
  const document = makeSnapshot(repositoryId);
  const first = await archive.put(repositoryId, document);
  const second = await archive.put(repositoryId, document);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.sha256, first.sha256);
  assert.equal(second.generation, first.generation);
  assert.equal(objects.size, 1);
  assert.equal(getCreateCalls(), 2);
  assert.deepEqual((await archive.get(repositoryId, first.sha256)).bytes, document);
  assert.equal([...objects.keys()][0].startsWith(".private-data/gitai/repository-snapshots/v1/verification/"), true);
  await archive.removeVerification(first);
  assert.equal(objects.size, 0);
});

test("malformed, cross-tenant, corrupt and conflicting archives are refused", async () => {
  const { archive, objects } = fixture();
  const repositoryId = randomUUID();
  const otherId = randomUUID();
  const document = makeSnapshot(repositoryId);
  await assert.rejects(archive.put(otherId, document), /identity/);
  await assert.rejects(archive.put(repositoryId, Buffer.from("{}")), /schema/);
  await assert.rejects(
    archive.put(repositoryId, makeSnapshot(repositoryId, Buffer.alloc(12 * 1024 * 1024 + 1))),
    /identity or schema/,
  );
  assert.equal(objects.size, 0);

  const receipt = await archive.put(repositoryId, document);
  const [name, stored] = [...objects.entries()][0];
  objects.set(name, { ...stored, bytes: Buffer.from("{}") });
  await assert.rejects(archive.get(repositoryId, receipt.sha256), /integrity|digest|schema/);
  const wrongScopeArchive = createPrivateRepositoryArchive({
    directory: "/test-bucket/.private-data",
    scope: "development",
    driver: {
      async create() { throw new Error("not needed"); },
      read: async key => {
        assert.notEqual(key, name);
        return { bytes: stored.bytes, generation: stored.generation, metadata: stored.custom };
      },
    },
  });
  await assert.rejects(wrongScopeArchive.get(repositoryId, receipt.sha256), /unavailable|metadata/);
});

test("archive locations reject unsafe private prefixes and deletion outside verification scope", async () => {
  const { archive, driver } = fixture();
  for (const directory of ["/bucket/../public", "/bucket/private//extra", "gs://bucket/private"]) {
    assert.throws(() => createPrivateRepositoryArchive({
      directory,
      scope: "test",
      driver,
    }), /path is invalid/);
  }
  const productionArchive = createPrivateRepositoryArchive({
    directory: "/test-bucket/.private-data",
    scope: "production",
    driver,
  });
  const productionRepositoryId = randomUUID();
  const productionReceipt = await productionArchive.put(
    productionRepositoryId,
    makeSnapshot(productionRepositoryId),
  );
  await assert.rejects(productionArchive.removeVerification(productionReceipt), /verified synthetic archive/);
  assert.equal(typeof archive.removeVerification, "function");
});
