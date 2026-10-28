# Replicated repository storage: implemented, not production-enabled

GitAI now has an opt-in development adapter for actual repository creation,
file proposals, reviewed merges and reads. The default development filesystem
mode is unchanged. Production readiness remains deliberately closed; no
environment flag alone enables production.

## Write invariant

1. Validate identity, ownership, quotas and the current database checkpoint.
2. Restore that exact hash into a fresh private temporary working directory.
   A verified backup read is allowed if the primary is unavailable. Never use
   an unrelated filesystem cache as a fallback.
3. Perform only fixed Git data operations, with hooks, external config,
   replacement objects and network protocols disabled. No submitted code runs.
4. Export a bounded snapshot, replicate it to App Storage and R2, and read/hash
   both copies. Both must succeed before continuing.
5. In one SQL transaction, recheck authorization, quotas and checkpoint
   revision. Atomically update the checkpoint with the proposal insert or merge
   status. A competing revision fails with 409 instead of overwriting it.
6. Remove the temporary directory even on failure.

Provider calls happen outside database locks. Failure before the SQL commit
leaves the old checkpoint authoritative. SQL rollback cannot publish a proposal
without its objects. Unreferenced immutable snapshots are retained, not deleted
as an attempted rollback; cleanup/retention needs a separately approved policy.
This is not an atomic cross-provider transaction or a database backup.

The checkpoint stores repository identity, revision, main OID, hash, byte count,
scope and provider revisions in server-only repository metadata. It is stripped
from API/feed/export serialization. New replicated proposals store paths/OIDs
in PostgreSQL, not file content; review content is loaded from verified Git
objects. Existing local-mode records are not rewritten or silently migrated.

## Snapshot protocol

| Body version | Accepted refs | Recovery |
| --- | --- | --- |
| 1, legacy read support | main; orphan proposal objects may be packed | main ref plus stored objects |
| 2, current export | main plus at most 200 `refs/heads/proposal-<UUID>` refs | validated main/proposal refs and packed objects |

Both formats reject extra document fields, unsafe paths, symlinks, executable
file modes, oversized files, foreign refs, corrupt packs and cross-repository
identity. Version 2 validates proposal trees too. Tags, remote refs, replacement
refs, hooks, repository config and credentials are not imported. SHA-256 is
integrity checking, not a signature or encryption.

Limits remain 100 files per tree, 64 KiB per file, 12 MiB pack data, 17 MiB
document, 2,000 commits and 200 proposal refs. Git object sizes are checked in
bounded batches. Storage keys retain the existing `repository-snapshots/v1`
namespace; body version and matching provider metadata select the codec.

## Setup and activation prerequisites

`GITAI_REPOSITORY_STORAGE=replicated` selects the new development path only
after both private providers have been configured. This value was **not set**
by this work. Use Project Secrets for credentials; never paste them into chat
or source. Both providers must be available for writes. An existing durable
record cannot downgrade to local mode, and an existing local record cannot
silently acquire a checkpoint: explicit reviewed migration is required.

The adapter permits two active sessions and 40 session starts per ten minutes
per server process, in addition to existing HTTP and record/repository quotas.
These are real local caps, not distributed quotas or a free-compute promise.
Repository/parser/preview isolation and distributed abuse budgets remain
separate security concerns. This adapter does not execute user applications.

Before enabling production, require an exact source reconciliation and owner
designation, live private R2 verification/independent restore, approved retention
and orphan handling, authenticated acceptance and a reviewed production
activation path. The hard production gate has not been opened. No production
database, provider policy, credential, invitation, payment or deployment was
changed.

## Verification and rollback

Root tests exercise create/propose/merge through private ephemeral working
copies and synthetic object transports. The disposable-schema integration
suite exercises the real application functions and SQL transactions: tenant
refusal, concurrent-edit CAS, forced SQL failure after proposal insert,
backup-write failure without database changes, Git-backed review content and
backup recovery reads. These tests are not live R2 evidence or signed-in
browser acceptance.

No live records were migrated. For a future rollback with durable records,
keep checkpoint-aware code and matched database/object receipts available.
Never point a pre-checkpoint filesystem-only build at durable records, drop
their metadata, or delete their immutable objects as a code rollback.
