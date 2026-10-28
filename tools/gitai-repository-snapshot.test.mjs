import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { exportRepositorySnapshot, restoreRepositorySnapshot } from "./gitai-repository-snapshot.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gitai-recovery-test-"));
  const source = join(root, "source"), backup = join(root, "backup"), restored = join(root, "restored");
  for (const dir of [source, backup, restored]) mkdirSync(dir, { mode: 0o700 });
  const id = randomUUID(), repo = join(source, id);
  const env = { PATH: process.env.PATH, HOME: "/nonexistent", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Synthetic", GIT_AUTHOR_EMAIL: "synthetic@example.invalid",
    GIT_COMMITTER_NAME: "Synthetic", GIT_COMMITTER_EMAIL: "synthetic@example.invalid", GIT_ALLOW_PROTOCOL: "" };
  const git = (args, input, directory = repo) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "--git-dir", directory, ...args],
    { env, input, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
  execFileSync("git", ["init", "--bare", "--template=", "--initial-branch=main", repo], { env, stdio: "pipe" });
  const blob = git(["hash-object", "-w", "--stdin"], "synthetic content\n");
  const tree = git(["mktree"], `100644 blob ${blob}\tREADME.md\n`);
  const main = git(["commit-tree", tree], "Synthetic main\n");
  git(["update-ref", "refs/heads/main", main]);
  const proposal = git(["commit-tree", tree, "-p", main], "Unmerged synthetic proposal\n");
  const proposalRef = `refs/heads/proposal-${randomUUID()}`;
  git(["update-ref", proposalRef, proposal]);
  return { root, source, backup, restored, id, repo, main, proposal, proposalRef, git };
}
test("private snapshot restores real history and orphan proposals without copying hooks/config", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.repo, "hooks"), { mode: 0o700 });
    writeFileSync(join(f.repo, "hooks", "post-update"), "#!/bin/sh\nexit 90\n", { mode: 0o700 });
    f.git(["config", "gitai.synthetic-marker", "true"]);
    const snapshot = exportRepositorySnapshot(f.source, f.id, f.backup);
    assert.equal(statSync(snapshot.file).mode & 0o077, 0);
    assert.equal(snapshot.commits, 2);
    // Recovery is into a separate, initially empty node, not the source cache.
    const result = restoreRepositorySnapshot(snapshot.file, f.id, f.restored);
    const restored = join(f.restored, f.id);
    assert.equal(result.head, f.main);
    assert.equal(f.git(["show", "main:README.md"], undefined, restored), "synthetic content");
    assert.equal(f.git(["cat-file", "-t", f.proposal], undefined, restored), "commit");
    assert.equal(f.git(["rev-parse", f.proposalRef], undefined, restored), f.proposal);
    const document = JSON.parse(readFileSync(snapshot.file, "utf8"));
    assert.equal(document.version, 2);
    const legacy = join(f.root, "legacy");
    mkdirSync(legacy, { mode: 0o700 });
    delete document.proposals;
    document.version = 1;
    const legacyFile = join(f.backup, "legacy.json");
    writeFileSync(legacyFile, JSON.stringify(document), { mode: 0o600 });
    assert.equal(restoreRepositorySnapshot(legacyFile, f.id, legacy).head, f.main);
    assert.equal(f.git(["cat-file", "-t", f.proposal], undefined, join(legacy, f.id)), "commit");
    assert.equal(existsSync(join(restored, "hooks", "post-update")), false);
    assert.equal(f.git(["config", "--list"], undefined, restored).includes("gitai.synthetic-marker"), false);
    assert.throws(() => restoreRepositorySnapshot(snapshot.file, f.id, f.restored), /never replaces/);
    assert.equal(f.git(["rev-parse", "main"], undefined, restored), f.main);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("cross-tenant IDs, corruption, unexpected fields and paths fail before publication", () => {
  const f = fixture();
  try {
    const snapshot = exportRepositorySnapshot(f.source, f.id, f.backup);
    assert.throws(() => restoreRepositorySnapshot(snapshot.file, randomUUID(), f.restored), /identity/);
    const document = JSON.parse(readFileSync(snapshot.file, "utf8"));
    const invalidPack = Buffer.from("not a Git pack");
    for (const changed of [
      { ...document, packSha256: "0".repeat(64) },
      { ...document, hooks: "/tmp/not-allowed" },
      { ...document, proposals: { "refs/heads/other": document.main } },
      { ...document, proposals: { [f.proposalRef]: "--help" } },
      { ...document, main: "--help" },
      { ...document, pack: document.pack + "\n" },
      { ...document, pack: invalidPack.toString("base64"), packSha256: createHash("sha256").update(invalidPack).digest("hex") },
    ]) {
      const bad = join(f.backup, randomUUID() + ".json");
      writeFileSync(bad, JSON.stringify(changed), { mode: 0o600 });
      assert.throws(() => restoreRepositorySnapshot(bad, f.id, f.restored));
      assert.deepEqual(readdirSync(f.restored), []);
    }
    assert.throws(() => exportRepositorySnapshot(f.source, "../escape", f.backup), /UUID/);
    assert.throws(() => restoreRepositorySnapshot(snapshot.file, "../escape", f.restored), /UUID/);
    const link = join(f.backup, "symlink.json");
    symlinkSync(snapshot.file, link);
    assert.throws(() => restoreRepositorySnapshot(link, f.id, f.restored), /regular snapshot/);
    symlinkSync(snapshot.file, join(f.repo, "unsafe-link"));
    assert.throws(() => exportRepositorySnapshot(f.source, f.id, f.backup), /symlinks/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
