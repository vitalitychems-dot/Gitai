import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRepositoryStorageReady, releaseReadiness } from "../lib/release-readiness";

test("development remains available without claiming durable Git storage", () => {
  assert.equal(releaseReadiness({ NODE_ENV: "development" }).ready, true);
  assert.equal(releaseReadiness({ NODE_ENV: "test" }).durableGitAvailable, false);
  assert.doesNotThrow(() => assertRepositoryStorageReady({ NODE_ENV: "test" }));
});

test("production cannot be enabled by owner or filesystem success flags", () => {
  for (const config of [
    {},
    { GITAI_OWNER_SUBJECT: "not-an-operator" },
    { GITAI_OWNER_SUBJECT: "a".repeat(64), GITAI_GIT_ROOT: "/durable-looking-path", GITAI_STORAGE_VERIFIED: "true" },
  ]) {
    const env = { ...config, NODE_ENV: "production" };
    const readiness = releaseReadiness(env);
    assert.equal(readiness.ready, false);
    assert.equal(readiness.durableGitAvailable, false);
    assert.throws(() => assertRepositoryStorageReady(env), (error: unknown) => {
      assert.equal((error as { status?: number }).status, 503);
      return true;
    });
  }
});
