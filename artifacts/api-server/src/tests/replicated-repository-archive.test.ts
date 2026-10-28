import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createPrivateRepositoryArchive, type SnapshotObjectDriver, type SnapshotObjectMetadata } from "../lib/private-repository-archive";
import { replicateRepositorySnapshot, SnapshotReplicationError } from "../lib/replicated-repository-archive";

function fixture() {
  const objects = new Map<string, { bytes: Buffer; generation: string; metadata: SnapshotObjectMetadata["custom"] }>();
  let unavailable = false;
  let corrupted = false;
  const driver: SnapshotObjectDriver = {
    async create(key, bytes, metadata) {
      if (unavailable) throw new Error("sensitive-provider-detail");
      if (objects.has(key)) throw Object.assign(new Error("exists"), { code: 412 });
      objects.set(key, { bytes: Buffer.from(bytes), generation: "1", metadata: metadata.custom });
      return { generation: "1" };
    },
    async read(key) {
      if (unavailable) throw new Error("sensitive-provider-detail");
      const item = objects.get(key);
      if (!item) throw new Error("missing");
      return { ...item, bytes: corrupted ? Buffer.from("{}") : Buffer.from(item.bytes) };
    },
  };
  const archive = createPrivateRepositoryArchive({ directory: "/test-bucket/private", scope: "test", driver });
  return { archive, objects, fail: () => { unavailable = true; }, recover: () => { unavailable = false; }, corrupt: () => { corrupted = true; } };
}

function input() {
  const repositoryId = randomUUID();
  const pack = Buffer.from("synthetic pack, not executable code");
  const document = Buffer.from(JSON.stringify({
    version: 1, repositoryId, createdAt: "2026-01-01T00:00:00.000Z",
    main: "a".repeat(40), packSha256: createHash("sha256").update(pack).digest("hex"),
    pack: pack.toString("base64"),
  }, null, 2));
  return { repositoryId, document };
}

test("replication reads both immutable copies and returns backup recovery bytes; retries are idempotent", async () => {
  const primary = fixture(), backup = fixture();
  const request = { primary: primary.archive, backup: backup.archive, ...input() };
  const first = await replicateRepositorySnapshot(request);
  const retry = await replicateRepositorySnapshot(request);
  assert.equal(first.primary.created, true);
  assert.equal(first.backup.created, true);
  assert.equal(retry.primary.created, false);
  assert.equal(retry.backup.created, false);
  assert.equal(first.primary.sha256, first.backup.sha256);
  assert.deepEqual(first.recoveryBytes, retry.recoveryBytes);
  assert.equal(primary.objects.size, 1);
  assert.equal(backup.objects.size, 1);
});

test("backup outage preserves primary and retry repairs only the missing copy", async () => {
  const primary = fixture(), backup = fixture();
  backup.fail();
  const stored: string[] = [];
  const request = { primary: primary.archive, backup: backup.archive, ...input() };
  await assert.rejects(replicateRepositorySnapshot({
    ...request, onStored: copy => stored.push(copy),
  }), (error: unknown) => {
    assert.ok(error instanceof SnapshotReplicationError);
    assert.equal(error.stage, "backup_write");
    assert.equal(error.message.includes("sensitive-provider-detail"), false);
    return true;
  });
  assert.deepEqual(stored, ["primary"]);
  assert.equal(primary.objects.size, 1);
  assert.equal(backup.objects.size, 0);
  backup.recover();
  const repaired = await replicateRepositorySnapshot(request);
  assert.equal(repaired.primary.created, false);
  assert.equal(repaired.backup.created, true);
});

test("unreadable or corrupted copies never produce a verified pair", async () => {
  for (const which of ["primary", "backup"] as const) {
    const primary = fixture(), backup = fixture();
    const request = { primary: primary.archive, backup: backup.archive, ...input() };
    (which === "primary" ? primary : backup).corrupt();
    await assert.rejects(replicateRepositorySnapshot(request), (error: unknown) => {
      assert.ok(error instanceof SnapshotReplicationError);
      assert.equal(error.stage, `${which}_read`);
      return true;
    });
    if (which === "primary") assert.equal(backup.objects.size, 0);
  }
});

test("same adapter, cross-repository input and mismatching read receipts fail closed", async () => {
  const primary = fixture(), backup = fixture();
  const snapshot = input();
  await assert.rejects(replicateRepositorySnapshot({
    primary: primary.archive, backup: primary.archive, ...snapshot,
  }));
  await assert.rejects(replicateRepositorySnapshot({
    primary: primary.archive, backup: backup.archive, ...snapshot, repositoryId: randomUUID(),
  }));
  assert.equal(primary.objects.size, 0);
  const wrongRevision = {
    ...backup.archive,
    async get(id: string, hash: string) {
      return { ...await backup.archive.get(id, hash), generation: "wrong" };
    },
  };
  await assert.rejects(replicateRepositorySnapshot({
    primary: primary.archive, backup: wrongRevision, ...snapshot,
  }), (error: unknown) => error instanceof SnapshotReplicationError && error.stage === "backup_read");
});

test("real Git history restores from synthetic backup after primary and source loss", async () => {
  const root = mkdtempSync(join(tmpdir(), "gitai-replication-test-"));
  const source = join(root, "source"), snapshots = join(root, "snapshots"), restored = join(root, "restored");
  const id = randomUUID(), repo = join(source, id);
  const snapshotTool = fileURLToPath(new URL("../../../../tools/gitai-repository-snapshot.mjs", import.meta.url));
  const env = {
    PATH: process.env.PATH, HOME: "/nonexistent", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Synthetic", GIT_AUTHOR_EMAIL: "synthetic@example.invalid",
    GIT_COMMITTER_NAME: "Synthetic", GIT_COMMITTER_EMAIL: "synthetic@example.invalid",
  };
  const run = (command: string, args: string[], input?: string) => execFileSync(command, args, {
    env, input, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  }).toString().trim();
  const git = (directory: string, args: string[], input?: string) => run("git", [
    "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
    "-c", "protocol.allow=never", "--git-dir", directory, ...args,
  ], input);
  try {
    for (const dir of [source, snapshots, restored]) mkdirSync(dir, { mode: 0o700 });
    run("git", ["init", "--bare", "--template=", "--initial-branch=main", repo]);
    const blob = git(repo, ["hash-object", "-w", "--stdin"], "synthetic recoverable text\n");
    const tree = git(repo, ["mktree"], `100644 blob ${blob}\tREADME.md\n`);
    const main = git(repo, ["commit-tree", tree], "Approved synthetic main\n");
    git(repo, ["update-ref", "refs/heads/main", main]);
    const proposal = git(repo, ["commit-tree", tree, "-p", main], "Unmerged synthetic proposal\n");
    const exported = JSON.parse(run(process.execPath, [snapshotTool, "export", source, id, snapshots]));
    const primary = fixture(), backup = fixture();
    const pair = await replicateRepositorySnapshot({
      primary: primary.archive, backup: backup.archive, repositoryId: id, document: readFileSync(exported.file),
    });
    primary.objects.clear();
    primary.fail();
    rmSync(source, { recursive: true });
    rmSync(snapshots, { recursive: true });
    // Download afresh, rather than restoring the coordinator's in-memory copy.
    const remote = await backup.archive.get(id, pair.backup.sha256);
    const file = join(root, "backup-recovery.json");
    writeFileSync(file, remote.bytes, { mode: 0o600 });
    run(process.execPath, [snapshotTool, "restore", file, id, restored]);
    const target = join(restored, id);
    assert.equal(git(target, ["rev-parse", "main"]), main);
    assert.equal(git(target, ["show", "main:README.md"]), "synthetic recoverable text");
    assert.equal(git(target, ["cat-file", "-t", proposal]), "commit");
    assert.equal(primary.objects.size, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
