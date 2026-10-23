#!/usr/bin/env node
// Operator-only recovery primitive, not a hosted storage backend or a public API.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync, realpathSync, mkdtempSync, renameSync, rmSync,
  openSync, closeSync, fsyncSync, linkSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OID = /^[a-f0-9]{40}$/;
const MAX_PACK = 12 * 1024 * 1024;
const MAX_JSON = 17 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const gitEnv = {
  PATH: process.env.PATH, HOME: "/nonexistent", LANG: "C",
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "",
};
function run(repo, args, input, maxBuffer = 2 * 1024 * 1024) {
  return execFileSync("git", ["--no-pager", "--no-replace-objects",
    "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
    "-c", "protocol.allow=never", "--git-dir", repo, ...args],
  { env: gitEnv, input, timeout: 15000, maxBuffer, stdio: ["pipe", "pipe", "pipe"] });
}
function idCheck(id) {
  if (!UUID.test(id)) throw new Error("Expected an exact repository UUID.");
}
function privateDirectory(path) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || realpathSync(absolute) !== absolute || (stat.mode & 0o077)) {
    throw new Error("Use an existing private directory (0700) without symlink ancestors.");
  }
  return absolute;
}
function sourceBudget(path, state = { bytes: 0, files: 0 }) {
  for (const entry of readdirSync(path)) {
    const child = join(path, entry), stat = lstatSync(child);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error("Repository recovery refuses symlinks and special files.");
    }
    if (++state.files > 20000 || (state.bytes += stat.size) > MAX_PACK) {
      throw new Error("Repository recovery budget exceeded.");
    }
    if (stat.isDirectory()) sourceBudget(child, state);
  }
}
function validateMain(repo) {
  const entries = run(repo, ["ls-tree", "-rz", "refs/heads/main"]).toString("utf8").split("\0").filter(Boolean);
  if (!entries.length || entries.length > 100) throw new Error("Repository file limit exceeded.");
  for (const entry of entries) {
    const match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    const path = match?.[2];
    if (!path || path.length > 200 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(path) ||
        path.split("/").some(p => !p || p === "." || p === ".." || p.startsWith(".")) ||
        /(?:^|\/)(?:node_modules|hooks|config|credentials)(?:\/|$)/i.test(path)) {
      throw new Error("Snapshot contains an unsupported file path or file mode.");
    }
    if (Number(run(repo, ["cat-file", "-s", match[1]]).toString()) > 65536) {
      throw new Error("Snapshot contains an oversized text file.");
    }
  }
}
export function exportRepositorySnapshot(sourceRoot, id, backupRoot) {
  idCheck(id);
  const root = privateDirectory(sourceRoot), destination = privateDirectory(backupRoot);
  const source = join(root, id);
  if (!lstatSync(source).isDirectory() || realpathSync(source) !== source) throw new Error("Invalid repository directory.");
  sourceBudget(source);
  // Alternates could read objects outside this repository. Never export them.
  for (const path of ["objects/info/alternates", "objects/info/http-alternates"]) {
    try { lstatSync(join(source, path)); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
    throw new Error("Repository alternates are not supported.");
  }
  run(source, ["fsck", "--full", "--strict", "--no-reflogs"]);
  validateMain(source);
  const refs = run(source, ["for-each-ref", "--format=%(refname) %(objectname)"]).toString().trim().split("\n");
  if (refs.length !== 1 || !/^refs\/heads\/main [a-f0-9]{40}$/.test(refs[0])) throw new Error("Unsupported repository references.");
  // Include orphan proposal commits too: proposals have not yet moved main.
  const commits = run(source, ["cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)"])
    .toString().trim().split("\n").filter(line => /^[a-f0-9]{40} commit$/.test(line)).map(line => line.slice(0, 40));
  if (!commits.length || commits.length > 2000) throw new Error("Snapshot commit budget exceeded.");
  const pack = run(source, ["pack-objects", "--stdout", "--revs"], commits.join("\n") + "\n", MAX_PACK);
  const document = Buffer.from(JSON.stringify({
    version: 1, repositoryId: id, createdAt: new Date().toISOString(),
    main: refs[0].split(" ")[1], packSha256: hash(pack), pack: pack.toString("base64"),
  }) + "\n");
  if (document.length > MAX_JSON) throw new Error("Snapshot size limit exceeded.");
  const file = join(destination, `${id}-${hash(document)}.gitai-snapshot.json`);
  const staging = mkdtempSync(join(destination, ".gitai-export-"));
  try {
    const temporary = join(staging, "snapshot");
    const fd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(fd, document); fsyncSync(fd); } finally { closeSync(fd); }
    // Atomic, no-clobber publication: a failed write never exposes a partial file.
    linkSync(temporary, file);
    const directory = openSync(destination, "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
    return { file, sha256: hash(document), bytes: document.length, commits: commits.length };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
export function restoreRepositorySnapshot(snapshotFile, expectedId, targetRoot) {
  idCheck(expectedId);
  const root = privateDirectory(targetRoot), file = resolve(snapshotFile);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON || realpathSync(file) !== file) {
    throw new Error("Use a bounded regular snapshot file, not a symlink.");
  }
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  if (!snapshot || Object.keys(snapshot).sort().join(",") !== "createdAt,main,pack,packSha256,repositoryId,version" ||
      snapshot.version !== 1 || snapshot.repositoryId !== expectedId || !OID.test(snapshot.main) ||
      !/^[a-f0-9]{64}$/.test(snapshot.packSha256) ||
      typeof snapshot.createdAt !== "string" || !Number.isFinite(Date.parse(snapshot.createdAt)) ||
      typeof snapshot.pack !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(snapshot.pack)) {
    throw new Error("Invalid snapshot schema or repository identity.");
  }
  const pack = Buffer.from(snapshot.pack, "base64");
  if (pack.length > MAX_PACK || pack.toString("base64") !== snapshot.pack || hash(pack) !== snapshot.packSha256) {
    throw new Error("Snapshot integrity verification failed.");
  }
  const target = join(root, expectedId), lockFile = join(root, `.gitai-restore-${expectedId}.lock`);
  // Concurrent recovery invocations cannot race to replace the same destination.
  const lock = openSync(lockFile, "wx", 0o600);
  let stage;
  try {
    // rename on Unix can replace an empty destination directory: refuse it too.
    if (readdirSync(root).includes(expectedId)) throw new Error("Restore never replaces an existing repository.");
    stage = mkdtempSync(join(root, ".gitai-restore-"));
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "--bare", "--template=", "--initial-branch=main", stage],
      { env: gitEnv, timeout: 15000, stdio: "pipe" });
    run(stage, ["index-pack", "--strict", "--stdin"], pack);
    if (run(stage, ["cat-file", "-t", snapshot.main]).toString().trim() !== "commit") throw new Error("Main is not a commit.");
    run(stage, ["update-ref", "refs/heads/main", snapshot.main]);
    run(stage, ["fsck", "--full", "--strict", "--no-reflogs"]);
    validateMain(stage);
    if (readdirSync(root).includes(expectedId)) throw new Error("Restore destination appeared during validation.");
    // Operator must keep this destination private and quiesced during recovery.
    renameSync(stage, target);
    return { repositoryId: expectedId, head: snapshot.main, packSha256: snapshot.packSha256 };
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
    closeSync(lock);
    rmSync(lockFile);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, first, id, destination, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || !first || !id || !destination || !["export", "restore"].includes(command)) {
      throw new Error("Usage: gitai-repository-snapshot.mjs export <source-root> <repo-uuid> <backup-dir> | restore <snapshot> <expected-repo-uuid> <target-root>");
    }
    const result = command === "export"
      ? exportRepositorySnapshot(first, id, destination)
      : restoreRepositorySnapshot(first, id, destination);
    console.log(JSON.stringify(result));
  } catch {
    console.error("Repository recovery failed. Check private paths, repository identity, quotas and snapshot integrity. No destination is overwritten.");
    process.exitCode = 1;
  }
}
