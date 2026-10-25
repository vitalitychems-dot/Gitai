/**
 * No environment flag can turn the development filesystem into durable storage.
 * Replace this gate only with a real storage adapter and verified restore path.
 */
export function releaseReadiness(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") {
    return { ready: true, ownerConfigured: false, durableGitAvailable: false };
  }
  const ownerConfigured = /^[a-f0-9]{64}$/.test(environment.GITAI_OWNER_SUBJECT ?? "");
  const durableGitAvailable = false;
  return { ready: false, ownerConfigured, durableGitAvailable };
}

export function assertRepositoryStorageReady(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV === "production") {
    const error = new Error("Repository storage is unavailable until durable storage and restore verification are configured.");
    Object.defineProperty(error, "status", { value: 503 });
    throw error;
  }
}
