import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { initNode, drop, approve, exportBundle, importBundle, state } from "./gitai-offline.mjs";

test("two synthetic nodes exchange approved bundles, reapprove locally and deduplicate", () => {
  const dir = mkdtempSync(join(tmpdir(), "gitai-two-node-"));
  try {
    const a = join(dir, "alpha"), b = join(dir, "beta");
    assert.equal(initNode(a, "alpha").network, "disabled");
    initNode(b, "beta");
    const first = drop(a, "community", "hello", "post", "Synthetic approved public note");
    const privateDraft = drop(a, "community", "draft", "post", "Not approved; must not export");
    assert.throws(() => approve(a, first.id, "yes"), /APPROVED/);
    approve(a, first.id, "APPROVED");
    const bundleA = join(dir, "alpha.bundle");
    assert.equal(exportBundle(a, bundleA).count, 1);
    assert.equal(importBundle(b, bundleA).importedPending, 1);
    assert.equal(state(b).approved.length, 0);
    assert.equal(state(b).pending.some(e => e.id === privateDraft.id), false);
    approve(b, first.id, "APPROVED");
    assert.equal(importBundle(b, bundleA).duplicates, 1);
    const second = drop(b, "community", "reply", "post", "Synthetic node beta reply");
    approve(b, second.id, "APPROVED");
    const bundleB = join(dir, "beta.bundle"); exportBundle(b, bundleB);
    importBundle(a, bundleB); approve(a, second.id, "APPROVED");
    assert.deepEqual(state(a).approved.map(e => e.id).sort(), state(b).approved.map(e => e.id).sort());
    assert.throws(() => initNode(a, "alpha"), /never reinitialize/);
    writeFileSync(join(dir, "bad.bundle"), "not a bundle");
    assert.throws(() => importBundle(b, join(dir, "bad.bundle")));
    assert.equal(state(b).approved.length, 2);
    assert.throws(() => drop(a, "../private", "oops", "post", "bad"), /Invalid/);
    assert.throws(() => exportBundle(b, bundleB), /overwrite/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("conflicting origins, tampered checksums and unsafe bundle paths fail quarantine", () => {
  const dir = mkdtempSync(join(tmpdir(), "gitai-hostile-bundle-"));
  try {
    const a = join(dir, "alpha"), b = join(dir, "beta"), imposter = join(dir, "imposter");
    initNode(a, "alpha"); initNode(b, "beta"); initNode(imposter, "alpha");
    const first = drop(a, "community", "note", "post", "Authentic synthetic fixture");
    approve(a, first.id, "APPROVED");
    const bundleA = join(dir, "a.bundle"); exportBundle(a, bundleA);
    importBundle(b, bundleA); approve(b, first.id, "APPROVED");
    const forged = drop(imposter, "community", "note", "post", "Different same-origin same-sequence fixture");
    approve(imposter, forged.id, "APPROVED");
    const bundleC = join(dir, "conflict.bundle"); exportBundle(imposter, bundleC);
    assert.throws(() => importBundle(b, bundleC), /Conflicting source sequence/);
    assert.equal(state(b).pending.length, 0);
    const repo = join(dir, "hostile.git");
    const g = (args, input) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "--git-dir", repo, ...args],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_ALLOW_PROTOCOL: "",
        GIT_AUTHOR_NAME: "Synthetic fixture", GIT_AUTHOR_EMAIL: "fixture@invalid",
        GIT_COMMITTER_NAME: "Synthetic fixture", GIT_COMMITTER_EMAIL: "fixture@invalid" } }).trim();
    g(["init", "--bare", "--template=", repo]);
    function maliciousBundle(name, payload, path) {
      const blob = g(["hash-object", "-w", "--stdin"], JSON.stringify(payload));
      const tree = g(["mktree"], `100644 blob ${blob}\t${path}\n`);
      const commit = g(["commit-tree", tree], "Hostile fixture\n");
      g(["update-ref", "refs/heads/community", commit]);
      const out = join(dir, name);
      g(["bundle", "create", out, "refs/heads/community"]);
      return out;
    }
    const tampered = maliciousBundle("tampered.bundle", { ...first, body: "Changed without updating ID" }, `${first.id}.json`);
    assert.throws(() => importBundle(b, tampered), /checksum mismatch/);
    const unsafe = maliciousBundle("unsafe.bundle", first, "README.md");
    assert.throws(() => importBundle(b, unsafe), /Unsafe path/);
    assert.deepEqual(state(b).approved.map(e => e.id), [first.id]);
    assert.equal(state(b).pending.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
