import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createPrivateRepositoryArchive, type SnapshotObjectMetadata } from "../lib/private-repository-archive";
import { assertSameCheckpoint, createRepositoryStorage, repositoryCheckpoint } from "../lib/repository-storage";
import { GIT_ROOT, git, head, initRepo, mergeRepo, readRepo, writeCommit } from "../lib/git-store";

function archiveFixture() {
  const objects = new Map<string, { bytes: Buffer; generation: string; metadata: SnapshotObjectMetadata["custom"] }>();
  let unavailable = false;
  const archive = createPrivateRepositoryArchive({
    directory: "/test-bucket/private", scope: "test", driver: {
      async create(key, bytes, metadata) {
        if (unavailable) throw new Error("synthetic outage");
        if (objects.has(key)) throw Object.assign(new Error("exists"), { code: 412 });
        objects.set(key, { bytes: Buffer.from(bytes), generation: "1", metadata: metadata.custom });
        return { generation: "1" };
      },
      async read(key) {
        if (unavailable) throw new Error("synthetic outage");
        const object = objects.get(key);
        if (!object) throw new Error("missing");
        return { ...object, bytes: Buffer.from(object.bytes) };
      },
    },
  });
  return { archive, objects, fail: () => { unavailable = true; }, recover: () => { unavailable = false; } };
}

test("ephemeral repository sessions replicate create/propose/merge and recover named proposal refs", async () => {
  const primary = archiveFixture(), backup = archiveFixture();
  const storage = createRepositoryStorage(primary.archive, backup.archive, "test");
  const id = randomUUID();
  let temporaryRepository = "";
  const created = await storage.mutate(id, undefined, () => {
    const main = initRepo(id, "Synthetic", "UNLICENSED");
    temporaryRepository = git(id, ["rev-parse", "--absolute-git-dir"]);
    return main;
  });
  assert.equal(existsSync(temporaryRepository), false);
  assert.equal(existsSync(join(GIT_ROOT, id)), false);
  const proposalRef = `refs/heads/proposal-${randomUUID()}`;
  const proposed = await storage.mutate(id, created.checkpoint, () => {
    const commit = writeCommit(id, head(id), "hello.txt", "bounded synthetic content", "Propose");
    git(id, ["update-ref", proposalRef, commit]);
    return commit;
  });
  assert.equal(proposed.checkpoint.main, created.value);
  primary.objects.clear();
  primary.fail();
  const recovered = await storage.read(id, proposed.checkpoint, () => ({
    head: head(id), proposal: git(id, ["rev-parse", proposalRef]),
  }));
  assert.equal(recovered.head, created.value);
  assert.equal(recovered.proposal, proposed.value);
  // Writes require BOTH providers even though reads can recover from backup.
  await assert.rejects(storage.mutate(id, proposed.checkpoint, () => {
    mergeRepo(id, created.value, proposed.value);
  }), /unavailable/);
  assert.equal((await storage.read(id, proposed.checkpoint, () => head(id))), created.value);
  primary.recover();
  const merged = await storage.mutate(id, proposed.checkpoint, () => mergeRepo(id, created.value, proposed.value));
  assert.equal(merged.checkpoint.main, proposed.value);
  const detail = await storage.read(id, merged.checkpoint, () => readRepo(id));
  assert.equal(detail.commits.length, 2);
  assert.equal(detail.files.find(file => file.path === "hello.txt")?.content, "bounded synthetic content");
});

test("checkpoint CAS, tenant/scope/revision validation and failed backup cannot advance metadata", async () => {
  const primary = archiveFixture(), backup = archiveFixture();
  const storage = createRepositoryStorage(primary.archive, backup.archive, "test");
  const id = randomUUID();
  const created = await storage.mutate(id, undefined, () => initRepo(id, "Synthetic", "MIT"));
  const cp = created.checkpoint;
  assert.equal(repositoryCheckpoint(id, { _gitCheckpoint: cp }).revision, cp.revision);
  assert.throws(() => repositoryCheckpoint(randomUUID(), { _gitCheckpoint: cp }), /checkpoint/);
  assert.throws(() => assertSameCheckpoint(cp, { _gitCheckpoint: { ...cp, revision: randomUUID() } }), /changed/);
  await assert.rejects(storage.read(randomUUID(), cp, () => head(id)), /unavailable/);
  await assert.rejects(storage.read(id, { ...cp, scope: "production" }, () => head(id)), /unavailable/);
  await assert.rejects(storage.read(id, { ...cp, primaryGeneration: "wrong", backupGeneration: "wrong" }, () => head(id)), /unavailable/);
  backup.fail();
  await assert.rejects(storage.mutate(id, cp, () => writeCommit(id, cp.main, "fail.txt", "", "Not committed")), /unavailable/);
  assert.equal((await storage.read(id, cp, () => readRepo(id))).commits.length, 1);
  assert.equal(primary.objects.size, 2, "Uncommitted snapshots are retained, never published or deleted on DB rollback");
});
