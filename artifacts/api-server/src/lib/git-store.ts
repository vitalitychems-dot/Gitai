import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const GIT_ROOT = resolve("runtime/gitai/repos");
const ID = /^[0-9a-f-]{36}$/;
const OID = /^[0-9a-f]{40}$/;
export function safePath(path: string) {
  if (path.length > 200 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(path) ||
      path.split("/").some(p => !p || p === "." || p === ".." || p.startsWith(".")) ||
      /(?:^|\/)(?:node_modules|hooks|config|credentials)(?:\/|$)/i.test(path)) {
    throw Object.assign(new Error("Use a safe relative text-file path without hidden or parent segments."), { status: 400 });
  }
  return path;
}
function folder(id: string) {
  if (!ID.test(id)) throw Object.assign(new Error("Invalid repository ID."), { status: 400 });
  return join(GIT_ROOT, id);
}
function env(extra: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH, HOME: "/nonexistent", LANG: "C",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "",
    GIT_AUTHOR_NAME: "GitAI operator", GIT_AUTHOR_EMAIL: "operator@invalid",
    GIT_COMMITTER_NAME: "GitAI operator", GIT_COMMITTER_EMAIL: "operator@invalid",
    ...extra,
  };
}
export function git(id: string, args: string[], input?: string, extra = {}, raw = false) {
  const output = execFileSync("git", ["--no-pager", "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false", "-c", "protocol.allow=never", "--git-dir", folder(id), ...args],
    { env: env(extra), input, encoding: "utf8", timeout: 5000, maxBuffer: 2 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  return raw ? output : output.trimEnd();
}
function bytes(path: string): number {
  return readdirSync(path, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? bytes(join(path, e.name)) : statSync(join(path, e.name)).size), 0);
}
export function checkRepoBudget(id: string) {
  if (bytes(folder(id)) > 10 * 1024 * 1024) throw Object.assign(new Error("Repository storage quota reached (10 MiB)."), { status: 413 });
}
export function initRepo(id: string, title: string, license: string) {
  mkdirSync(GIT_ROOT, { recursive: true, mode: 0o700 });
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "--bare", "--template=", "--initial-branch=main", folder(id)],
    { env: env(), timeout: 5000, stdio: "pipe" });
  return writeCommit(id, null, "README.md", `# ${title}\n\nLicense selection: ${license}.\n\nCreated by the repository operator in GitAI. No external publication.\n`, "Initialize repository");
}
export function removeRepo(id: string) { rmSync(folder(id), { recursive: true, force: true }); }
export function head(id: string) { return git(id, ["rev-parse", "refs/heads/main"]); }
export function writeCommit(id: string, base: string | null, path: string, content: string, message: string) {
  safePath(path);
  if (Buffer.byteLength(content) > 65536) throw Object.assign(new Error("Text files are limited to 64 KiB."), { status: 413 });
  if (base && !OID.test(base)) throw Object.assign(new Error("Invalid base object ID."), { status: 400 });
  checkRepoBudget(id);
  const dir = mkdtempSync(join(tmpdir(), "gitai-index-"));
  try {
    const indexEnv = { GIT_INDEX_FILE: join(dir, "index") };
    git(id, base ? ["read-tree", base] : ["read-tree", "--empty"], undefined, indexEnv);
    const blob = git(id, ["hash-object", "-w", "--stdin"], content);
    git(id, ["update-index", "--add", "--cacheinfo", "100644", blob, path], undefined, indexEnv);
    const tree = git(id, ["write-tree"], undefined, indexEnv);
    const files = git(id, ["ls-tree", "-r", "--name-only", tree]).split("\n");
    if (files.length > 100) throw Object.assign(new Error("Repository file quota reached (100 files)."), { status: 413 });
    const commit = git(id, ["commit-tree", tree, ...(base ? ["-p", base] : [])], message + "\n");
    if (!base) git(id, ["update-ref", "refs/heads/main", commit]);
    return commit;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
export function readRepo(id: string) {
  const current = head(id);
  const files = git(id, ["ls-tree", "-r", "--name-only", current]).split("\n").filter(Boolean).map(path => ({
    path, content: git(id, ["show", `${current}:${safePath(path)}`], undefined, {}, true),
  }));
  const commits = git(id, ["log", "-50", "--format=%H%x09%cI%x09%s", "refs/heads/main"]).split("\n").filter(Boolean).map(line => {
    const [oid, time, ...message] = line.split("\t");
    return { oid, time, message: message.join("\t") };
  });
  return { files, commits, head: current };
}
export function mergeRepo(id: string, base: string, commit: string) {
  if (!OID.test(base) || !OID.test(commit)) throw Object.assign(new Error("Invalid commit."), { status: 400 });
  if (head(id) !== base) throw Object.assign(new Error("Repository changed. Review a new proposal against the current head."), { status: 409 });
  git(id, ["merge-base", "--is-ancestor", base, commit]);
  git(id, ["update-ref", "refs/heads/main", commit, base]);
}
