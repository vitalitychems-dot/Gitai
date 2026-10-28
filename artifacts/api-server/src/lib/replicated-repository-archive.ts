import { createHash } from "node:crypto";
import type { createPrivateRepositoryArchive, SnapshotReceipt } from "./private-repository-archive";

type Archive = Pick<ReturnType<typeof createPrivateRepositoryArchive>, "put" | "get">;
type Copy = "primary" | "backup";
export type ReplicationStage = "primary_write" | "primary_read" | "backup_write" | "backup_read";

export class SnapshotReplicationError extends Error {
  constructor(readonly stage: ReplicationStage) {
    // Never propagate provider errors: they may contain object paths or credentials.
    super(`Repository snapshot replication failed at ${stage}.`);
    this.name = "SnapshotReplicationError";
  }
}

function verifiedRead(
  receipt: SnapshotReceipt,
  read: Awaited<ReturnType<Archive["get"]>>,
  repositoryId: string,
) {
  if (receipt.repositoryId !== repositoryId ||
      read.generation !== receipt.generation ||
      read.bytes.length !== receipt.bytes ||
      createHash("sha256").update(read.bytes).digest("hex") !== receipt.sha256) {
    throw new Error("Snapshot receipt does not match stored data.");
  }
}

/**
 * A verified pair of immutable snapshots, NOT a database consistency checkpoint.
 * There is no delete/rollback on failure: a successful primary copy must survive
 * a backup outage. Retrying the same document is idempotent in both adapters.
 * Callers must supply distinct providers; object equality alone cannot prove
 * account isolation, retention, or independence of infrastructure.
 */
export async function replicateRepositorySnapshot({
  primary, backup, repositoryId, document, onStored,
}: {
  primary: Archive;
  backup: Archive;
  repositoryId: string;
  document: Uint8Array;
  onStored?: (copy: Copy, receipt: SnapshotReceipt) => void;
}) {
  let stage: ReplicationStage = "primary_write";
  try {
    if (primary === backup) throw new Error("Distinct providers required.");
    const primaryReceipt = await primary.put(repositoryId, document);
    onStored?.("primary", primaryReceipt);
    stage = "primary_read";
    const primaryRead = await primary.get(repositoryId, primaryReceipt.sha256);
    verifiedRead(primaryReceipt, primaryRead, repositoryId);
    stage = "backup_write";
    // Use the primary's validated canonical bytes, not a second interpretation.
    const backupReceipt = await backup.put(repositoryId, primaryRead.bytes);
    onStored?.("backup", backupReceipt);
    if (backupReceipt.sha256 !== primaryReceipt.sha256 ||
        backupReceipt.scope !== primaryReceipt.scope) {
      throw new Error("Copies disagree.");
    }
    stage = "backup_read";
    const backupRead = await backup.get(repositoryId, backupReceipt.sha256);
    verifiedRead(backupReceipt, backupRead, repositoryId);
    if (!backupRead.bytes.equals(primaryRead.bytes)) throw new Error("Copies disagree.");
    return {
      version: 1 as const,
      primary: primaryReceipt,
      backup: backupReceipt,
      // Recovery consumers deliberately use the backup, not the local input.
      recoveryBytes: Buffer.from(backupRead.bytes),
    };
  } catch {
    throw new SnapshotReplicationError(stage);
  }
}
