#!/usr/bin/env node
/**
 * GitAI manual exchange v1. No listener, fetch, checkout, hooks or model calls.
 * Checksums are NOT signatures. Imported drops require local approval again.
 * This is an independent extension, not modified upstream GitMesh code.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync, mkdtempSync, rmSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const MAX_EVENTS = 1000, MAX_EVENT = 8192, MAX_BUNDLE = 8 * 1024 * 1024;
const hash = s => createHash("sha256").update(s).digest("hex");
const ID = /^[a-f0-9]{64}$/;
const NODE = /^[a-z][a-z0-9-]{1,49}$/;
const fail = m => { throw new Error(m); };
const canonical = o => JSON.stringify(o); // ordered wire fields, validated below
function atomic(path, data) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("Symlink denied");
  const temp = path + ".new";
  writeFileSync(temp, data, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}
function directory(path) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("Symlink denied");
  mkdirSync(path, { recursive: true, mode: 0o700 });
}
// Linux prlimit is a prerequisite: fail closed elsewhere until a vetted
// equivalent can enforce parser resource limits. No secret environment inherited.
function git(dir, args, input) {
  return execFileSync("prlimit", [
    "--cpu=5", "--as=536870912", "--fsize=16777216", "--nofile=64",
    "--", "git", "--no-pager", "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false", "-c", "protocol.allow=never", "--git-dir", dir, ...args,
  ], {
    input, encoding: "utf8", timeout: 8000, maxBuffer: 10 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: "/nonexistent", LANG: "C", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "",
      GIT_AUTHOR_NAME: "GitAI offline node", GIT_AUTHOR_EMAIL: "offline@invalid",
      GIT_COMMITTER_NAME: "GitAI offline node", GIT_COMMITTER_EMAIL: "offline@invalid" },
    stdio: ["pipe", "pipe", "pipe"],
  }).trimEnd();
}
function initBare(dir) { git(dir, ["init", "--bare", "--template=", "--initial-branch=community", dir]); }
function config(root) {
  if (lstatSync(root).isSymbolicLink()) fail("Symlink node denied");
  const c = JSON.parse(readFileSync(join(root, "node.json"), "utf8"));
  if (c.version !== 1 || !NODE.test(c.node)) fail("Invalid node identity");
  return c;
}
function files(root, area) {
  const dir = join(root, area);
  return readdirSync(dir).map(name => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) fail("Unexpected node file");
    const path = join(dir, name);
    if (!lstatSync(path).isFile() || statSync(path).size > MAX_EVENT) fail("Unsafe record");
    return validate(JSON.parse(readFileSync(path, "utf8")));
  });
}
function validate(e) {
  if (!e || e.version !== 1 || !NODE.test(e.origin) || !NODE.test(e.namespace) ||
      !ID.test(e.id) || !/^[a-z][a-z0-9-]{1,59}$/.test(e.object) ||
      !Number.isSafeInteger(e.sequence) || e.sequence < 1 ||
      !["post", "service", "profile", "correction"].includes(e.kind) ||
      typeof e.body !== "string" || !e.body || e.body.length > 4000 ||
      typeof e.observedAt !== "string" || !Number.isFinite(Date.parse(e.observedAt)) ||
      (e.previous !== null && !ID.test(e.previous)) ||
      e.room !== "public" || e.provenance !== "unsigned-manual" ||
      Object.keys(e).sort().join() !== ["version", "origin", "namespace", "object", "sequence", "kind", "body", "observedAt", "previous", "room", "provenance", "id"].sort().join()) fail("Invalid event envelope");
  const value = { version: 1, origin: e.origin, namespace: e.namespace, object: e.object,
    sequence: e.sequence, kind: e.kind, body: e.body, observedAt: e.observedAt,
    previous: e.previous, room: "public", provenance: "unsigned-manual" };
  if (hash(canonical(value)) !== e.id || Buffer.byteLength(canonical(e)) > MAX_EVENT) fail("Event checksum mismatch");
  if (/-----BEGIN .*PRIVATE KEY-----|(?:ghp_|sk_live_)[A-Za-z0-9]{16,}/.test(e.body)) fail("Possible credential denied");
  return { ...value, id: e.id };
}
export function initNode(root, node) {
  root = resolve(root);
  if (!NODE.test(node)) fail("Invalid logical node name");
  if (existsSync(join(root, "node.json"))) fail("Node already exists; never reinitialize it");
  directory(root);
  for (const a of ["approved", "pending"]) directory(join(root, a));
  atomic(join(root, "node.json"), canonical({ version: 1, node }));
  return { node, address: `gitai:${node}`, network: "disabled" };
}
export function drop(root, namespace, object, kind, body) {
  root = resolve(root);
  const c = config(root);
  const all = [...files(root, "approved"), ...files(root, "pending")];
  if (all.length >= MAX_EVENTS) fail("Node quota reached");
  const previous = all.filter(e => e.origin === c.node).sort((a, b) => b.sequence - a.sequence)[0];
  const value = { version: 1, origin: c.node, namespace, object, sequence: (previous?.sequence ?? 0) + 1,
    kind, body, observedAt: new Date().toISOString(), previous: previous?.id ?? null, room: "public", provenance: "unsigned-manual" };
  const e = validate({ ...value, id: hash(canonical(value)) });
  atomic(join(root, "pending", `${e.id}.json`), canonical(e));
  return e;
}
export function approve(root, id, decision) {
  root = resolve(root); config(root);
  if (decision !== "APPROVED" || !ID.test(id)) fail("Explicit local owner APPROVED required");
  const pending = files(root, "pending");
  const event = pending.find(e => e.id === id);
  if (!event) {
    if (files(root, "approved").some(e => e.id === id)) return { id, duplicate: true };
    fail("Pending event not found");
  }
  const approved = files(root, "approved");
  if (approved.some(e => e.origin === event.origin && e.sequence === event.sequence && e.id !== event.id)) fail("Conflicting sequence; resolve manually");
  if (event.sequence > 1 && !approved.some(e => e.id === event.previous && e.origin === event.origin && e.sequence === event.sequence - 1)) fail("Approve the preceding event first");
  atomic(join(root, "approved", `${id}.json`), canonical(event));
  rmSync(join(root, "pending", `${id}.json`));
  return { id, localApproval: "APPROVED", signature: "not implemented" };
}
export function exportBundle(root, destination) {
  root = resolve(root); config(root);
  const approved = files(root, "approved");
  if (!approved.length) fail("No locally approved public events");
  if (existsSync(destination)) fail("Refusing to overwrite a bundle");
  const temp = mkdtempSync(join(tmpdir(), "gitai-export-")), repo = join(temp, "data.git");
  try {
    initBare(repo);
    const entries = approved.sort((a, b) => a.id.localeCompare(b.id)).map(e => {
      const blob = git(repo, ["hash-object", "-w", "--stdin"], canonical(e));
      return `100644 blob ${blob}\t${e.id}.json\0`;
    }).join("");
    const tree = git(repo, ["mktree", "-z"], entries);
    const commit = git(repo, ["commit-tree", tree], "Approved public GitAI event snapshot\n");
    git(repo, ["update-ref", "refs/heads/community", commit]);
    git(repo, ["bundle", "create", resolve(destination), "refs/heads/community"]);
    if (statSync(destination).size > MAX_BUNDLE) { rmSync(destination); fail("Bundle exceeds quota"); }
    return { count: approved.length, encrypted: false, signed: false };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
export function importBundle(root, bundle) {
  root = resolve(root); config(root);
  if (!lstatSync(bundle).isFile() || statSync(bundle).size > MAX_BUNDLE) fail("Bundle must be a regular file <=8 MiB");
  const temp = mkdtempSync(join(tmpdir(), "gitai-quarantine-")), repo = join(temp, "data.git");
  try {
    // Copy bounded bytes before Git sees them; no imported config, hooks or checkout.
    const copied = join(temp, "incoming.bundle");
    writeFileSync(copied, readFileSync(bundle), { mode: 0o600 });
    initBare(repo);
    git(repo, ["bundle", "verify", copied]);
    const refs = git(repo, ["bundle", "list-heads", copied]).split("\n");
    if (refs.length !== 1 || !/^[0-9a-f]{40} refs\/heads\/community$/.test(refs[0])) fail("Unexpected bundle refs");
    const oid = refs[0].split(" ")[0];
    git(repo, ["bundle", "unbundle", copied]);
    const entries = git(repo, ["ls-tree", "-z", oid]).split("\0").filter(Boolean);
    if (entries.length > MAX_EVENTS) fail("Event quota exceeded");
    const incoming = entries.map(line => {
      const m = /^100644 blob ([0-9a-f]{40})\t([a-f0-9]{64})\.json$/.exec(line);
      if (!m) fail("Unsafe path, mode or object");
      if (Number(git(repo, ["cat-file", "-s", m[1]])) > MAX_EVENT) fail("Oversized event");
      const e = validate(JSON.parse(git(repo, ["cat-file", "blob", m[1]])));
      if (e.id !== m[2]) fail("Path/checksum mismatch");
      return e;
    });
    const existing = [...files(root, "approved"), ...files(root, "pending")];
    const seen = new Set(existing.map(e => e.id));
    const additions = incoming.filter(e => !seen.has(e.id));
    if (existing.length + additions.length > MAX_EVENTS) fail("Node quota exceeded");
    const all = [...existing, ...additions];
    const slots = new Map();
    for (const e of all) {
      const slot = `${e.origin}:${e.sequence}`;
      if (slots.has(slot) && slots.get(slot) !== e.id) fail("Conflicting source sequence; entire import rejected");
      slots.set(slot, e.id);
      if ((e.sequence === 1 && e.previous !== null) || (e.sequence > 1 && !all.some(p => p.id === e.previous && p.origin === e.origin && p.sequence === e.sequence - 1))) fail("Broken event chain");
    }
    // Entire bundle is validated before any records become pending.
    for (const e of additions) atomic(join(root, "pending", `${e.id}.json`), canonical(e));
    return { importedPending: additions.length, duplicates: incoming.length - additions.length, approval: "local owner APPROVED still required", signed: false };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
export function state(root) { config(resolve(root)); return { approved: files(resolve(root), "approved"), pending: files(resolve(root), "pending") }; }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [cmd, root, ...args] = process.argv.slice(2);
  try {
    const action = { init: initNode, drop, approve, export: exportBundle, import: importBundle, state }[cmd];
    if (!action || !root) fail("Usage: node tools/gitai-offline.mjs init|drop|approve|export|import|state NODE_DIR ...");
    process.stdout.write(JSON.stringify(action(root, ...args), null, 2) + "\n");
  } catch (e) { process.stderr.write(`GitAI: ${e.message}\n`); process.exitCode = 1; }
}
