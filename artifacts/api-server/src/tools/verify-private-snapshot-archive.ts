import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openConfiguredPrivateRepositoryArchive } from "../lib/private-repository-archive";
import { openConfiguredPrivateR2RepositoryArchive } from "../lib/r2-repository-archive";
import { replicateRepositorySnapshot } from "../lib/replicated-repository-archive";
import type { SnapshotReceipt } from "../lib/private-repository-archive";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const snapshotTool = join(workspaceRoot, "tools/gitai-repository-snapshot.mjs");
const gitEnvironment = {
  PATH: process.env.PATH,
  HOME: "/nonexistent",
  LANG: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ALLOW_PROTOCOL: "",
  GIT_AUTHOR_NAME: "GitAI Synthetic Verification",
  GIT_AUTHOR_EMAIL: "synthetic@example.invalid",
  GIT_COMMITTER_NAME: "GitAI Synthetic Verification",
  GIT_COMMITTER_EMAIL: "synthetic@example.invalid",
};

function git(repo: string, args: string[], input?: string) {
  return execFileSync("git", [
    "--no-pager", "--no-replace-objects",
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "protocol.allow=never",
    "--git-dir", repo,
    ...args,
  ], { env: gitEnvironment, input, timeout: 15_000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] })
    .toString("utf8").trim();
}

function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function createSyntheticRepository(sourceRoot: string, id: string) {
  const repository = join(sourceRoot, id);
  execFileSync("git", ["init", "--bare", "--template=", "--initial-branch=main", repository], {
    env: gitEnvironment,
    timeout: 15_000,
    stdio: "pipe",
  });
  const blob = git(repository, ["hash-object", "-w", "--stdin"], "synthetic repository data\n");
  const tree = git(repository, ["mktree"], `100644 blob ${blob}\tREADME.md\n`);
  const main = git(repository, ["commit-tree", tree], "Synthetic approved main\n");
  git(repository, ["update-ref", "refs/heads/main", main]);
  const proposal = git(repository, ["commit-tree", tree, "-p", main], "Synthetic unmerged proposal\n");
  const proposalRef = `refs/heads/proposal-${randomUUID()}`;
  git(repository, ["update-ref", proposalRef, proposal]);
  return { repository, main, proposal, proposalRef };
}

type ArchiveProvider = "app-storage" | "r2" | "dual";
type PrivateArchive = ReturnType<typeof openConfiguredPrivateRepositoryArchive>;

function archiveProviderFromArgs(args: string[]): ArchiveProvider {
  if (args.length === 0) return "app-storage";
  if (args.length === 1 && args[0] === "--r2") return "r2";
  if (args.length === 1 && args[0] === "--dual") return "dual";
  throw new Error("Use no option for App Storage, --r2 for R2, or --dual for both.");
}

function openArchive(provider: ArchiveProvider): PrivateArchive {
  return provider === "r2"
    ? openConfiguredPrivateR2RepositoryArchive("verification")
    : openConfiguredPrivateRepositoryArchive("verification");
}

let verificationStage = "private archive configuration";
process.on("warning", warning => {
  if (warning.name === "MaxListenersExceededWarning") {
    console.error(`Storage SDK listener warning observed during: ${verificationStage}.`);
  }
});

async function verify() {
  const provider = archiveProviderFromArgs(process.argv.slice(2));
  let layout: string[] | undefined;
  if (provider !== "r2") {
    verificationStage = "private App Storage configuration";
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) throw new Error("Private App Storage is not configured.");
    const privatePath = privateDir.trim().replace(/^\/+/, "");
    layout = privatePath.split("/");
    const bucketName = layout[0];
    if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucketName) ||
        layout.slice(1).some(part => !/^[A-Za-z0-9._-]{1,200}$/.test(part) || part === "." || part === "..")) {
      throw new Error("Private App Storage path is invalid.");
    }
  }

  // Validate BOTH configurations before creating fixtures or making any writes.
  verificationStage = `${provider} configuration`;
  const archive = openArchive(provider);
  const backupArchive = provider === "dual"
    ? openConfiguredPrivateR2RepositoryArchive("verification") : undefined;
  const cleanup: { archive: PrivateArchive; receipt: SnapshotReceipt }[] = [];
  const track = (target: PrivateArchive, receipt: SnapshotReceipt) => {
    if (receipt.created) cleanup.push({ archive: target, receipt });
  };

  verificationStage = "Synthetic fixture setup";
  const id = randomUUID();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "gitai-private-archive-verification-"));
  chmodSync(temporaryRoot, 0o700);
  const sourceRoot = join(temporaryRoot, "source");
  const localBackup = join(temporaryRoot, "snapshot");
  const restoreRoot = join(temporaryRoot, "restored");
  for (const path of [sourceRoot, localBackup, restoreRoot]) privateDirectory(path);

  try {
    verificationStage = "synthetic Git repository";
    const { main, proposal, proposalRef } = createSyntheticRepository(sourceRoot, id);
    verificationStage = "local Git snapshot export";
    const exported = execFileSync(process.execPath, [snapshotTool, "export", sourceRoot, id, localBackup], {
      cwd: workspaceRoot,
      timeout: 30_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const localReceipt = JSON.parse(exported) as { file: string; sha256: string };
    if (!UUID.test(id) || !/^[a-f0-9]{64}$/.test(localReceipt.sha256)) {
      throw new Error("Synthetic repository snapshot did not validate.");
    }
    const document = readFileSync(localReceipt.file);
    verificationStage = `${provider} synthetic snapshot write`;
    let created: SnapshotReceipt;
    let downloaded: { bytes: Buffer; generation: string };
    if (backupArchive) {
      const request = {
        primary: archive, backup: backupArchive, repositoryId: id, document,
        onStored: (copy: "primary" | "backup", receipt: SnapshotReceipt) => {
          track(copy === "primary" ? archive : backupArchive, receipt);
        },
      };
      const pair = await replicateRepositorySnapshot(request);
      verificationStage = "dual-provider idempotent retry";
      const retry = await replicateRepositorySnapshot(request);
      if (!pair.primary.created || !pair.backup.created ||
          retry.primary.created || retry.backup.created ||
          retry.primary.generation !== pair.primary.generation ||
          retry.backup.generation !== pair.backup.generation) {
        throw new Error("Dual archive retry was not idempotent.");
      }
      created = pair.backup;
      downloaded = { bytes: pair.recoveryBytes, generation: pair.backup.generation };
    } else {
      created = await archive.put(id, document);
      track(archive, created);
      verificationStage = "idempotent archive retry";
      const retry = await archive.put(id, document);
      if (!created.created || retry.created || retry.generation !== created.generation) {
        throw new Error("Private archive retry was not idempotent.");
      }
      verificationStage = `${provider} synthetic snapshot read`;
      downloaded = await archive.get(id, created.sha256);
    }
    const downloadedSha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
    if (downloaded.bytes.length !== created.bytes ||
        downloadedSha256 !== created.sha256 ||
        downloaded.generation !== created.generation) {
      throw new Error("Remote snapshot verification failed.");
    }

    const filePath = join(localBackup, "remote.gitai-snapshot.json");
    writeFileSync(filePath, downloaded.bytes, { mode: 0o600 });
    chmodSync(filePath, 0o600);
    verificationStage = "separate-node Git restore";
    execFileSync(process.execPath, [snapshotTool, "restore", filePath, id, restoreRoot], {
      cwd: workspaceRoot,
      timeout: 30_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const restoredRepository = join(restoreRoot, id);
    if (git(restoredRepository, ["rev-parse", "refs/heads/main"]) !== main ||
        git(restoredRepository, ["show", "main:README.md"]) !== "synthetic repository data" ||
        git(restoredRepository, ["cat-file", "-t", proposal]) !== "commit" ||
        git(restoredRepository, ["rev-parse", proposalRef]) !== proposal) {
      throw new Error("Remote snapshot did not restore expected synthetic Git history.");
    }

    let privacyCheck: Record<string, boolean | string>;
    if (provider !== "r2" && layout) {
      verificationStage = "anonymous private-object access check";
      const bucketName = layout[0];
      const relativeObjectName = [
        ...layout.slice(1),
        "gitai",
        "repository-snapshots",
        "v1",
        "verification",
        id,
        `${created.sha256}.json`,
      ].filter(Boolean).map(encodeURIComponent).join("/");
      const unauthenticatedUrl = `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${relativeObjectName}`;
      const publicResponse = await fetch(unauthenticatedUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      await publicResponse.body?.cancel();
      if (publicResponse.status !== 403 && publicResponse.status !== 404) {
        throw new Error("Synthetic private archive is readable without authentication.");
      }
      privacyCheck = provider === "dual"
        ? { appStorageUnauthenticatedReadDenied: true, r2UnauthenticatedReadCheck: "not_performed" }
        : { unauthenticatedReadDenied: true };
    } else {
      privacyCheck = { unauthenticatedReadCheck: "not_performed" };
    }
    return {
      provider,
      storedAndRestored: true,
      restoredFrom: provider === "dual" ? "r2" : provider,
      bothCopiesReadVerified: provider === "dual",
      ...privacyCheck,
      idempotentRetry: true,
      mainHistoryVerified: true,
      proposalHistoryVerified: true,
      bytes: created.bytes,
      snapshotSha256: createHash("sha256").update(document).digest("hex"),
    };
  } finally {
    // Attempt every cleanup even when a different provider is unavailable.
    const results = await Promise.allSettled(
      cleanup.map(({ archive: target, receipt }) => target.removeVerification(receipt)),
    );
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (results.some(result => result.status === "rejected")) {
      verificationStage = `${provider} synthetic object cleanup`;
      throw new Error("Synthetic object cleanup needs operator attention.");
    }
  }
}

verify().then(result => {
  console.log(JSON.stringify(result));
}).catch(() => {
  console.error(`Private synthetic archive verification failed at: ${verificationStage}. No application repository was uploaded; check the private storage provider and synthetic test cleanup.`);
  process.exitCode = 1;
});
