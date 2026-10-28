export function exportRepositorySnapshot(sourceRoot: string, id: string, backupRoot: string): {
  file: string; sha256: string; bytes: number; commits: number;
};
export function restoreRepositorySnapshot(snapshotFile: string, expectedId: string, targetRoot: string): {
  repositoryId: string; head: string; packSha256: string;
};
