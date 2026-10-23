# GitAI launch preparation — 2026-10-23

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

These are recovery building blocks and safety gates, **not a hosted durable Git
store**. No remote backup has been uploaded, independently retained or restored.
The production gate must remain closed until an actual adapter is implemented,
metadata/object consistency is tested, and independent backup recovery succeeds.

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

1. **Durable primary plus independent backup:** the owner selected App Storage
   primary plus a private Cloudflare R2 backup. App Storage provisioning succeeded
   and configured the three standard storage keys in this Project. No repository
   objects were uploaded, public storage routes added, or production adapter
   enabled. Cloudflare's API integration is available but not yet connected.
   Finish app-specific private prefixes/buckets, encryption, least-privilege IAM,
   quotas, retention and recovery ownership before remote tests. App Storage has
   no documented object versioning, lifecycle rules or retention policies; it
   alone is not an independent backup. Provisioning does not establish durability
   or permit opening the production gate.
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
https://docs.replit.com/features/auth-and-identity/clerk-auth.

## Rollout and rollback

Current local receipts: full workspace typecheck, root unit tests (six marketplace
plus four recovery/readiness tests), disposable DB integration (two groups),
production-refusal HTTP integration, normal and kernel-network-denied offline
exchange tests, API bundle and root-path frontend bundle all passed. Signed-out
browser checks passed at 390/768/1440 px; the 390px app screenshot was inspected.
The frontend build retains source-map and large-chunk warnings. Dependency,
static-security and privacy scanners reported zero findings. These are local
receipts, not authenticated browser, durable remote storage or deployment proof.

Do not publish this preparatory source while readiness is intentionally failing.
The existing published build remains unchanged. Keep runner execution, collectors,
package publication, financial operations and external admission disabled.
Before any future promotion, record an exact coherent source commit and storage
snapshot/database consistency point. Roll back via the supported publishing
history/checkpoint process, restoring matched metadata and Git snapshots if
required; never force-push or reinitialize the canonical GitAI repository.
