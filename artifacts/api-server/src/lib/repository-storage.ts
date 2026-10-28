import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod/v4";
import { exportRepositorySnapshot, restoreRepositorySnapshot } from "../../../../tools/gitai-repository-snapshot.mjs";
import { head, withEphemeralGitRoot } from "./git-store";
import { openConfiguredPrivateRepositoryArchive } from "./private-repository-archive";
import { openConfiguredPrivateR2RepositoryArchive } from "./r2-repository-archive";
import { replicateRepositorySnapshot } from "./replicated-repository-archive";
import { assertRepositoryStorageReady } from "./release-readiness";
import { logger } from "./logger";

type Archive = Pick<ReturnType<typeof openConfiguredPrivateRepositoryArchive>, "put" | "get">;
const checkpointSchema = z.object({
  version: z.literal(1), revision: z.uuid(), repositoryId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), main: z.string().regex(/^[a-f0-9]{40}$/),
  bytes: z.number().int().min(1).max(17 * 1024 * 1024),
  scope: z.enum(["development", "test", "production"]),
  primaryGeneration: z.string().min(1).max(128),
  backupGeneration: z.string().min(1).max(128),
}).strict();
export type RepositoryCheckpoint = z.infer<typeof checkpointSchema>;

function unavailable(message = "Verified repository storage is unavailable.", status = 503): never {
  throw Object.assign(new Error(message), { status });
}
export function repositoryCheckpoint(repositoryId: string, data: Record<string, unknown>) {
  const result = checkpointSchema.safeParse(data._gitCheckpoint);
  if (!result.success || result.data.repositoryId !== repositoryId) unavailable("Repository has no valid durable checkpoint. Explicit migration is required.");
  return result.data;
}
export function assertSameCheckpoint(before: RepositoryCheckpoint, data: Record<string, unknown>) {
  const after = repositoryCheckpoint(before.repositoryId, data);
  if (before.revision !== after.revision || before.sha256 !== after.sha256) {
    unavailable("Repository changed. Reload and review again.", 409);
  }
}

// Bound memory/disk pressure per process. Distributed quotas remain a launch gate.
let active = 0;
let budgetStart = Date.now();
let sessionsStarted = 0;
export function createRepositoryStorage(primary: Archive, backup: Archive, scope: RepositoryCheckpoint["scope"]) {
  if (primary === backup) unavailable();
  async function session<T>(
    id: string, checkpoint: RepositoryCheckpoint | undefined, write: boolean, fn: () => T | Promise<T>,
  ): Promise<{ value: T; checkpoint?: RepositoryCheckpoint }> {
    assertRepositoryStorageReady();
    if (!z.uuid().safeParse(id).success || (checkpoint &&
        (checkpoint.repositoryId !== id || checkpoint.scope !== scope || !checkpointSchema.safeParse(checkpoint).success))) unavailable();
    if (active >= 2) unavailable("Repository storage is busy. Retry shortly.", 429);
    if (Date.now() - budgetStart >= 10 * 60_000) {
      budgetStart = Date.now();
      sessionsStarted = 0;
    }
    if (sessionsStarted >= 40) unavailable("Repository storage quota reached (40 sessions per 10 minutes per server).", 429);
    sessionsStarted++;
    active++;
    let root: string | undefined;
    let stage = "setup";
    try {
      root = mkdtempSync(join(tmpdir(), "gitai-repository-session-"));
      chmodSync(root, 0o700);
      const repos = join(root, "repos"), snapshots = join(root, "snapshots");
      for (const path of [repos, snapshots]) mkdirSync(path, { mode: 0o700 });
      if (checkpoint) {
        stage = "download";
        const readCopy = async (archive: Archive, generation: string) => {
          const read = await archive.get(id, checkpoint.sha256);
          if (read.generation !== generation || read.bytes.length !== checkpoint.bytes ||
              createHash("sha256").update(read.bytes).digest("hex") !== checkpoint.sha256) unavailable();
          const snapshot: unknown = JSON.parse(read.bytes.toString("utf8"));
          if (!snapshot || typeof snapshot !== "object" || !("main" in snapshot) || snapshot.main !== checkpoint.main) unavailable();
          return read.bytes;
        };
        let document: Buffer;
        try { document = await readCopy(primary, checkpoint.primaryGeneration); }
        catch {
          logger.warn({ repositoryId: id, stage: "primary_read" }, "Attempting verified repository backup recovery");
          document = await readCopy(backup, checkpoint.backupGeneration);
        }
        const file = join(snapshots, "restore.json");
        writeFileSync(file, document, { mode: 0o600 });
        stage = "restore";
        restoreRepositorySnapshot(file, id, repos);
      } else if (!write) unavailable();
      return await withEphemeralGitRoot(repos, async () => {
        stage = "operation";
        const value = await fn();
        if (!write) return { value };
        stage = "export";
        const snapshot = exportRepositorySnapshot(repos, id, snapshots);
        stage = "replicate";
        const pair = await replicateRepositorySnapshot({
          primary, backup, repositoryId: id, document: readFileSync(snapshot.file),
        });
        if (pair.primary.scope !== scope || pair.backup.scope !== scope) unavailable();
        return {
          value,
          checkpoint: checkpointSchema.parse({
            version: 1, revision: randomUUID(), repositoryId: id,
            sha256: pair.primary.sha256, main: head(id), bytes: pair.primary.bytes, scope,
            primaryGeneration: pair.primary.generation, backupGeneration: pair.backup.generation,
          }),
        };
      });
    } catch (error) {
      // No snapshot bytes, titles, actor identities, provider errors or paths.
      logger.warn({ repositoryId: id, stage }, "Repository session failed");
      // Preserve bounded operation validation/conflict errors; redact everything else.
      if (stage === "operation" && error && typeof error === "object" &&
          "status" in error && [400, 403, 404, 409, 413, 429].includes(Number(error.status))) throw error;
      return unavailable();
    } finally {
      try { if (root) rmSync(root, { recursive: true, force: true }); }
      catch {
        logger.warn({ repositoryId: id, stage: "cleanup" }, "Repository session cleanup failed");
        unavailable();
      }
      finally { active--; }
    }
  }
  return {
    async read<T>(id: string, checkpoint: RepositoryCheckpoint, fn: () => T | Promise<T>): Promise<T> {
      return (await session(id, checkpoint, false, fn)).value;
    },
    async mutate<T>(id: string, checkpoint: RepositoryCheckpoint | undefined, fn: () => T | Promise<T>) {
      const result = await session(id, checkpoint, true, fn);
      if (!result.checkpoint) unavailable();
      return { value: result.value, checkpoint: result.checkpoint };
    },
  };
}

type RepositoryStorage = ReturnType<typeof createRepositoryStorage>;
const testStorage = new AsyncLocalStorage<RepositoryStorage>();
export function withTestRepositoryStorage<T>(storage: RepositoryStorage, fn: () => Promise<T>) {
  if (process.env.NODE_ENV !== "test") unavailable();
  return testStorage.run(storage, fn);
}
export function configuredRepositoryStorage(): RepositoryStorage | undefined {
  assertRepositoryStorageReady();
  const injected = process.env.NODE_ENV === "test" ? testStorage.getStore() : undefined;
  if (injected) return injected;
  const mode = process.env.GITAI_REPOSITORY_STORAGE;
  if (!mode || mode === "local") return undefined;
  if (mode !== "replicated") unavailable();
  try {
    return createRepositoryStorage(
      openConfiguredPrivateRepositoryArchive("development"),
      openConfiguredPrivateR2RepositoryArchive("development"),
      "development",
    );
  } catch { return unavailable(); }
}
export function storageForRepository(id: string, data: Record<string, unknown>) {
  const storage = configuredRepositoryStorage();
  if (storage || data._gitCheckpoint !== undefined) {
    if (!storage) unavailable("Durable repository storage cannot fall back to local files.");
    return { storage, checkpoint: repositoryCheckpoint(id, data) };
  }
  return undefined;
}
