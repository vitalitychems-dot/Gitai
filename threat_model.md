# GitAI threat model

## Project Overview

GitAI is an independent browser-based developer and community application with
React/Vite, an Express API, PostgreSQL, Clerk authentication, local development
Git storage and private snapshot adapters. Production Git mutations fail closed
while durable Git storage, owner designation and authenticated acceptance remain
unverified. Code execution, collectors and payment operations are disabled.

## Assets

- Clerk sessions and operator-scoped profile, invitation, repository and
  agreement data; compromise can expose private work or impersonate an operator.
- Private Git objects, proposals and snapshot archives. Snapshot payloads are
  not client-side encrypted; provider storage controls and recovery access matter.
- Public community posts and source metadata; untrusted content must not become
  executable code or trusted instructions.
- Future payment records and credentials; live funds, raw cards, bank details and
  identity documents are not collected or processed by the current slice.
- Replit and future R2 credentials; compromise could expose or destroy stored
  private snapshots.

## Trust Boundaries

- Anonymous/authenticated browser -> API -> PostgreSQL and development bare Git.
- API -> Replit App Storage for private snapshot objects.
- API -> Cloudflare R2 through an implemented but unconfigured S3-compatible
  adapter; no R2 account or credentials are currently connected.
- Local owner -> CLI -> quarantined imported Git bundle; imported content is
  untrusted and is never executed.
- External sources -> disabled collector; app -> unavailable isolated runner
  and payment providers.

## Scan Anchors

- Production API and authorization surfaces: `artifacts/api-server/src/`.
- Private snapshot validation and provider boundary:
  `artifacts/api-server/src/lib/private-repository-archive.ts` and
  `artifacts/api-server/src/lib/r2-repository-archive.ts`.
- Production readiness gate: `artifacts/api-server/src/lib/release-readiness.ts`.
- Local recovery and offline-bundle handling: `tools/gitai-repository-snapshot.mjs`
  and `tools/gitai-offline.test.mjs`.
- `artifacts/mockup-sandbox/` is a development preview service, not the
  production execution environment.

## Threat Categories

| Threat | Controls present | Residual risk / gate |
|---|---|---|
| Cross-tenant reads/writes | Clerk-derived hashed operator subject; server ownership checks; private repos invisible to other operators; disposable-schema isolation test | Shared host filesystem not adequate for arbitrary guest execution; owner-only repository membership MVP |
| Forged ownership/admin/admission | No client-supplied owner; no automatic first-user admin; owner configured explicitly outside public endpoints; invitation accept fails closed | No owner designated; no public community admission |
| Malicious code/MCP/repo hooks | Data-only bare Git plumbing, empty templates, no checkout; hidden/parent paths denied; no shell interpolation; no submitted command execution | Git binary parser must remain patched; publication scanning and full runner absent |
| Malicious preview/browser XSS | React escapes plain content; no iframe/executable preview or raw HTML rendering | Separate-origin runner previews and a production CSP must be built before enabling previews |
| Prompt injection/excessive agency | No model calls or model tools enabled; external content treated only as data | Future AI requires scoped capabilities, schema validation, source labeling, consent and adversarial tests |
| SSRF/exfiltration | No arbitrary URL fetch/import or collector endpoint; offline Git network disabled; Clerk fixed provider target | Future gateway needs hostname/IP/redirect/DNS validation, allowlist, timeout, response budget and robots/provider policy |
| Resource abuse | 96 KiB request cap, 240 requests/min conservative connection budget; per-operator record/repo/file/storage limits; Git timeout/output caps; CLI parser prlimit | Multi-instance distributed limits, quota reclamation and worker offloading not built; proxy connections may share quota |
| R2 credential abuse or snapshot tampering | Fixed account endpoint from a validated account ID; restricted bucket-name format; environment-only credentials; atomic `If-None-Match: *` writes; `If-Match` reads; strict metadata and content-hash validation; 30-second requests and 17-MiB body cap; adapter errors omit credentials | No R2 account, private-bucket policy or credentials are configured. R2 API bucket versioning is unsupported. No live upload/restore, retention policy or independent recovery exists. Verification deletion has only a pre-delete ETag check because `DeleteObject` is not conditional; it is restricted to synthetic verification keys. Bucket/account administrators can still delete or replace objects outside this adapter. |
| Financial replay/false finality | No payment execution endpoint; deterministic immutable quote ID; integer cumulative refund reconciliation | Actual idempotency, webhook signature verification and ledger reconciliation not built; cannot claim payment safety verified |
| Offline replay/tampering | Canonical checksum/chain/sequence validation; dedup; reject conflicts; quarantine, safe modes and local reapproval | No signatures/trust/revocation, unverified origins and unencrypted bundles; no financial finality |
| Secret/PII leak | No raw cards/bank/ID docs; no credential fields, request payload/IP/path logging disabled; limited secret-pattern rejection; public exports opt-in; runtime excluded from Git | Pattern check not full secret/malware scanning; public replication cannot guarantee erasure; legal retention/access review needed |
| Dependency compromise | Pinned auth packages/lockfile; current pnpm and dependency scans report zero advisories after GitHub withdrew the former braces advisory, without suppression | Zero audit findings is not a guarantee; revalidate the exact release head and dependency licenses |
| Loss of repository objects on deployment | Production remains hard-gated. Opt-in development repository create/propose/merge/read uses private ephemeral copies and verified replicated checkpoints; proposal insert/status and checkpoint CAS commit atomically in SQL. Snapshot v2 preserves validated UUID proposal refs, excludes hooks/config and supports legacy v1 reads. Disposable SQL tests cover rollback and concurrent conflicts. | No live repository migration or production activation. Live R2 restore, retention/orphan cleanup, matched database recovery, distributed quotas and authenticated acceptance remain unverified. Local caps are two concurrent sessions and 40 starts per ten minutes per process. |
| Partial backup write or false replication success | Coordinator reads and hashes both immutable copies, matches repository/scope/provider revision, refuses corrupted reads and preserves primary on backup outage; retries repair only the missing copy. Synthetic tests restore real Git main/proposal history after source and primary loss. | Verified copies are not an atomic database/Git checkpoint. Distinct adapter objects alone do not prove separate accounts/infrastructure. Manual dual smoke requires both configurations and still cannot certify R2 public-access policy or retention. |

## Deliberate non-goals / blocked operations

No claim of perfect security, consciousness, unlimited free compute or live
offline internet. No production/deployment/external Git publication, bulk outreach,
Moltbook scrape, real invite, wallet/coin/exchange or agent legal-payee verification.
No advertisement automation or physical transaction authority.

## Release gate

**No-go for public production.** First slice is suitable for controlled
development inspection only. Designate the production owner; verify authenticated
browser paths; connect durable Git storage and a live independent backup; review
privacy/deletion/retention and abuse policy; establish moderation readiness.
Recheck dependencies and licenses against the exact release head. Execution and
payment gates require separate infrastructure/provider review and explicit
approval as described in PROTOCOL-SECURITY.md.
