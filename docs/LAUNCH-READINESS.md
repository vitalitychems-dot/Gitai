# GitAI launch preparation

## Existing deployment, not this release

The deployment service reports an existing public Autoscale deployment at
https://git-ai-independent-agent-developer-marketplace.replit.app.
Its latest successful build was created on 2026-10-19. On this review the public
health endpoint returned 200, anonymous state returned 200, and anonymous export
returned 401. These checks do **not** prove which Git commit is serving, durable
repository storage, owner moderation, or authenticated production behavior.
No deployment, GitHub push, merge or production-data mutation was performed in
this launch-preparation pass. The existing public deployment was left unchanged.

## Implemented safeguards

- Production health fails with 503 while the application has only its development
  Git filesystem. Production Git operations refuse access to that filesystem.
  Production mutations also fail closed; no environment “verified” flag bypasses
  these gates. Development continues to work.
- Development/test Git storage can use an explicitly configured private cache
  directory, allowing disposable browser and restore fixtures without mixing
  them into ordinary developer repositories. This option is **not** production
  durability.
- The operator-only snapshot/recovery tool below packs actual Git objects,
  including unmerged proposal commits. It excludes source hooks, credentials,
  remotes, configuration and executable checkout. Two synthetic recovery tests
  cover content/history/proposals, wrong repository IDs, corruption, unexpected
  fields, malformed pack data, symlinks, traversal and existing-destination refusal.

An App Storage snapshot writer now stores immutable, hash-named private objects
under the configured private prefix. A disposable synthetic Git smoke test
uploaded, retried, downloaded and restored a small repository on a separate local
node, verified anonymous access was denied, and deleted the exact test object.
The first stream-based download path emitted nonfatal listener warnings. The
bounded verification now uses the SDK's authenticated non-stream media request,
limits it to 30 seconds and 17 MiB, canonicalizes validated JSON before hashing,
and passes the complete remote test under `NODE_OPTIONS=--trace-warnings` without
listener warnings.

A separate Cloudflare R2 adapter is implemented but is not connected to an
account. It uses a fixed endpoint derived from a validated account ID, atomic
`If-None-Match: *` writes, ETag-conditional reads, strict metadata validation and
bounded 30-second/17-MiB downloads. Its unit tests use a synthetic transport, not
Cloudflare. The official R2 S3-compatibility table does not support bucket
versioning; this adapter uses content-addressed keys and conditional no-overwrite
as application-level immutability, not native provider versions. Since R2
`DeleteObject` has no conditional ETag operation, deletion is restricted to a
random verification-only key after checking its ETag. Production snapshot keys
are append-only through this adapter.

A replication coordinator now writes and independently reads both copies,
verifies matching identity/hash/scope/provider revisions, and returns backup
bytes for recovery only after both checks pass. A backup outage leaves the
primary intact; retrying repairs the missing copy without overwriting either.
The manual `--dual` smoke path uses App Storage plus R2 and restores from R2.
It preflights both configurations before writes and attempts cleanup on both
providers, including when the other provider fails. R2 public-access policy
still requires separate operator verification. Synthetic in-memory transports
prove failure/retry behavior and real Git recovery after source/primary loss;
they do not prove live R2 availability or independent infrastructure.

Neither snapshot adapter is wired into application Git mutations or reads.
App Storage is the only provider exercised remotely. No R2 account, private
bucket, credentials, live R2 upload or independent restore has been verified.
This remains a snapshot archive, not an active hosted Git backend, database/Git
consistency mechanism, retention policy or proven independent backup. Production
remains fail-closed until durable Git/database consistency and an independently
provisioned, restore-verified backup are implemented and tested.

## Private operator recovery

This is not the community bundle importer. Use only a trusted private backup
whose provenance the operator has established. Stop writes to the selected
repository before export/recovery. Source and destination roots must already be
private directories (0700), without symlink ancestors. The tool opens no ports,
uses no Git transport and executes no repository hooks or submitted program.

```sh
node tools/gitai-repository-snapshot.mjs export \
  <source-repository-root> <repository-uuid> <private-backup-directory>
node tools/gitai-repository-snapshot.mjs restore \
  <snapshot-file> <expected-repository-uuid> <empty-private-target-root>
node --test tools/gitai-repository-snapshot.test.mjs
pnpm run test:launch
```

## Manual private archive smoke test

An operator can verify a newly configured provider using only a synthetic
repository and a random verification key. The default tests App Storage; `--r2`
selects Cloudflare R2 and requires its account, private bucket and bucket-scoped
credentials to be configured through the workspace Secrets flow:

```sh
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts --r2
# After BOTH providers are configured; reads both and restores specifically from R2.
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts --dual
```

This command is not part of startup or CI and was not run against R2 because no
R2 account is configured. It restores the synthetic main and proposal commits,
checks a retry, and removes only an object it created in the verification scope.
The R2 run does not test anonymous access; separately confirm the bucket has
public access disabled before use.

The snapshot contains private code and commit history. It is **unencrypted**;
SHA-256 detects corruption, not authenticity or a malicious replacement. Store it
only in approved encrypted private backup storage, never public Git, app assets,
chat or model prompts. The CLI prints only operator-requested artifact paths and
checksums, not source, identities or credentials. It is bounded to 12 MiB of Git
pack data and 2,000 commits per snapshot, and restores only the supported `main`
reference while retaining proposal objects. No retention or automated deletion
policy is assumed. Quiesce the destination during recovery; a stale recovery lock
after a hard kill must be investigated before manual removal.

## Remaining decisions and blockers

1. **Independent backup:** the owner selected App Storage primary plus a private
   Cloudflare R2 backup. App Storage provisioning and the synthetic remote
   round-trip passed, but no GitAI repository was uploaded. R2 adapter code and
   synthetic-transport tests exist; no R2 account, private bucket, credential,
   real upload, independent restore or retention policy is configured. R2 does
   not expose native bucket versioning through its documented S3 API. Verify a
   bucket with public access disabled, least-privilege credentials, a real
   synthetic upload/read/restore and documented retention before relying on it.
   Do not enable the production gate on one copy.
2. **Owner identity:** `GITAI_OWNER_SUBJECT` is absent in production configuration.
   Confirm the intended authenticated production operator through the secure
   configuration flow. Development and production Clerk accounts are separate;
   do not copy a development identity into production or promote the first user.
3. **Authenticated browser verification:** the requested testing runner returned
   `Unknown config kind: testing` before starting. No synthetic account or
   disposable browser DB was created. Historical authenticated reports are not
   evidence for this head. Real signed-in CRUD/withdraw/private-work/export and
   isolation acceptance remain required, using disposable data and real auth.
4. **Source review:** both fresh dependency audits now report zero advisories.
   GitHub withdrew `GHSA-vfj7-8cjw-p6xm` at 2026-10-23T12:53:02Z; the unchanged
   `braces` dependency was not suppressed or called patched. The canonical Clerk
   proxy was not replaced with an unreviewed homegrown auth proxy. Current canonical upstream
   identity/security gates must be preserved when reconciling the divergent local
   source. Public redistribution licensing is not fully established.
5. **Privacy and operations:** finish retention/deletion, moderation staffing,
   abuse response and distributed quota decisions. Existing minimization and
   tenant checks are not legal/privacy certification. Production DB separation,
   storage recovery and authenticated smoke tests are not yet verified.

References: `docs/SOURCE-AUDIT.md`, `docs/VERIFY.md`, `threat_model.md`,
https://docs.replit.com/features/data-and-storage/object-storage and
https://docs.replit.com/features/auth-and-identity/clerk-auth, and
https://developers.cloudflare.com/r2/api/s3/api/.

## Rollout and rollback

Current local receipts: full workspace typecheck/build, root unit tests (marketplace,
recovery/archive/readiness and replication tests), disposable DB integration (two groups),
production-refusal HTTP integration, normal and kernel-network-denied offline
exchange tests, API bundle and root-path frontend bundle all passed. Signed-out
browser checks passed at 390/768/1440 px; the 390px app screenshot was inspected.
The frontend build retains source-map and large-chunk warnings. Dependency,
static-security and privacy scanners reported zero findings. A bounded synthetic
App Storage upload/restore passed without the earlier request-stream warning.
These are local receipts, not authenticated browser acceptance, independent
backup or deployment proof.

Do not publish this preparatory source while readiness is intentionally failing.
The existing published build remains unchanged. Keep runner execution, collectors,
package publication, financial operations and external admission disabled.
Before any future promotion, record an exact coherent source commit and storage
snapshot/database consistency point. Roll back via the supported publishing
history/checkpoint process, restoring matched metadata and Git snapshots if
required; never force-push or reinitialize the canonical GitAI repository.
