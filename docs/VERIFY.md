# Verification and operational status

## Consent-based marketplace update

The marketplace now supports private bids, explicit accountable-operator
consent, one-tier three-party subcontracts, deadlines and milestones, manual
deliveries, buyer rejection/resubmission/acceptance, evidence-bearing disputes,
mutually agreed resolutions, and interaction-backed private reviews.

Verified in a disposable database schema: both offer/request role directions,
private visibility, immutable agreement records, consent replay/concurrency,
upstream subcontract consent, expired deadlines, executable-delivery refusal,
multi-milestone completion, stale delivery decisions, disputes/resolutions and
review evidence/duplicate restrictions. The test drops its schema afterward.
`pnpm run typecheck` passed after contract regeneration.

An earlier authenticated synthetic buyer/seller browser report exercised proposal,
consent, executable 503 refusal, manual rejection/resubmission, two milestone
acceptances, both reviews, dispute/evidence and mutual resolution with reload
persistence. Anonymous and outsider views excluded private work data. Synthetic
fixtures were removed by their exact IDs. See
`gitai-marketplace-authenticated-regression.md` for replay details and responsive
checks. It predates this source head and is **historical, not current acceptance**.
Subcontract and withdrawal browser forms were not exercised in that pass; their
state/authorization rules have disposable DB coverage.

These results do not remove the production blockers below. Identity assertions
remain self-reported, executable work remains blocked without an isolated
runner, payment providers remain disabled, and fees are calculation-only.

After integrating concurrent main-branch work, the duplicate legacy lifecycle
write routes were explicitly retired (authenticated 410, anonymous 401), rather
than retaining a path around operator/delivery/evidence safeguards. The
disposable-schema suite exercises every retired route through the actual
Express router with synthetic authenticated middleware output for buyer, seller
and outsider identities, plus anonymous requests. It covers attempted activation,
undeclared delivery, delivery-free completion via dispute resolution, and review
creation, and asserts that the database remains unchanged. Full typecheck and
the expanded suite passed after this correction; the new lifecycle UI and its
previously verified browser journey were not changed by retiring these routes.

## Participant agreement history

`GET /api/gitai/work` now serves private bid/agreement records separately from
the 1,000-row community feed. It requires sign-in, returns only bids whose
participant list contains the caller's hashed subject, and uses bounded keyset pagination.
Participant lookup is backed by a JSONB GIN index. Results use descending
creation-time/UUID ordering; the cursor retains PostgreSQL's full timestamp
precision and its UUID tie-breaker so equal-time records are not skipped.

The disposable PostgreSQL regression inserts 1,105 synthetic public posts,
10,000 private agreements across 100 buyers and one shared seller, and two older
target agreements at the same microsecond timestamp. It verifies the real query
planner selects the participant GIN index, shared buyers see only their own
records, and the target member's cursor pages exactly match their full history
once each, without any crowd fixture IDs or private evidence. The public feed
remains capped and excludes bids. The actual Express route is exercised for
signed-out, unrelated and participant identities. The marketplace UI reads this
separate endpoint and offers “Load older agreements”; bid mutations invalidate
the private-work query. Personal JSON exports now also include bid agreements
where the caller is a participant but not the record owner; the route regression
checks the participant's private agreement evidence appears in their export,
while anonymous and unrelated exports do not.

## What actually ran in this build

- OpenAPI code generation and TypeScript library generation.
- Full workspace `pnpm run typecheck` passed, with API/web checks after
  follow-on changes. API workflow builds its actual runnable bundle.
- Two Node test groups in `artifacts/api-server/src/tests/commons.test.ts` passed:
  - Exact 4%+4% cents calculation, $100 -> $104/$96/$8, deterministic immutable
    quote IDs, cumulative full/partial refund rounding and invalid input.
  - A freshly created disposable PostgreSQL schema,
    synthetic owners and real bare Git objects. Verified private repository
    isolation, file/history read, proposal, required review confirmation, merge,
    replay/stale-base denial, path rejection, persistent service/forum/comment
    drafts, revoked/expired invitations and hidden replies after parent withdrawal.
    Indexed private-work pagination, equal-microsecond cursor boundaries, 1,105
    synthetic public posts, 10,000 mixed private agreements, route-level
    participant isolation and evidence retention. Schema and synthetic Git
    directories were removed afterward.
- Two offline test groups passed in `tools/gitai-offline.test.mjs`, run using
  `python tools/test-network-denied.py`. The kernel filter was first verified to
  reject socket creation, then inherited by Node and Git:
  - Two isolated synthetic nodes exchanged manual approved Git bundles in both
    directions, reapproved on receipt, deduplicated replays and reconciled IDs.
    Unapproved drafts did not export.
  - Conflicting origin/sequence, tampered checksums, unsafe bundle filenames and
    malformed bundles were rejected without publishing incoming content.
- `pnpm run test` executes six
  Marketplace-attention tests: consent and expiry, buyer/seller/nonparticipant
  visibility for every category, upcoming versus overdue seller deadlines,
  delivery decisions and redelivery, and disputed work/resolution responses.
  It also runs two local Git snapshot/restore tests, three private archive
  verification tests, three synthetic-transport R2 adapter tests and two
  production-readiness tests through `test:launch`.
  A separate real HTTP integration test verifies production health and mutations
  return 503 while the durable Git backend and independent backup are absent.
- Real Playwright/Chromium checks at **390, 768 and 1440 px**:
  - Public community/repository/marketplace/people/fees/offline/settings routes
    render; no horizontal page overflow at those sizes.
  - Real fee/refund API interaction from UI; mobile menu navigation; sign-in email
    field renders; signed-out Marketplace badge stays hidden; no uncaught browser
    page errors.
  - Anonymous write/export denied, runner returns 503, invalid refund returns
    400, cross-origin write returns 403.
  - Browser screenshots are written outside the repository to `/tmp/gitai-browser-test/`.
- Visual app preview inspected at desktop; mobile overflow on offline page was
  found in the browser test, fixed, and the acceptance test then passed.
- The API server production bundle and GitAI production Vite build passed.
  Vite 7.3.7 reports a tooltip source-map warning and a minified chunk above
  500 kB; neither failed the build. `/api/healthz` returned 200 after the final
  workflow restart. The browser suite is signed-out only; no authenticated
  browser mutation was tested. No deployment, external Git push, outreach or
  financial operation was performed.
- A synthetic App Storage smoke check uploaded a 714-byte isolated Git snapshot,
  verified an idempotent retry and generation-bound read, restored its main and
  orphan proposal commit into a second private node, and confirmed anonymous
  storage access was denied. The exact synthetic object was removed. No user
  repository was uploaded. This verifies one storage provider only, not an
  independent R2 backup or the active Git repository backend.
- The Cloudflare R2 adapter's three unit tests use a fake transport to verify
  conditional immutable writes, ETag-checked bounded reads, metadata validation,
  and verification-only deletion. Cloudflare's documented R2 S3 API lacks
  bucket-versioning operations; the adapter does not assume native versions.
  No R2 credentials or bucket are configured, so no live R2 request, independent
  restore or real backup has been tested. The manual R2 smoke command was also
  run with empty R2 configuration and stopped before network access; this verifies
  fail-closed configuration handling only, not R2 availability.
- A dependency upgrade moved workspace schemas to Zod 4.6.7, compatible generated
  schemas to Zod 4, Express to 5.3.0, body-parser to 2.4.0, qs to 6.16.1, and
  fast-uri to 3.1.9. Current pnpm, static and privacy scans report zero findings.
  `@google-cloud/storage` 8.4.0 is Apache-2.0. Its stream-based download emitted
  listener warnings in the initial synthetic check. Replacing that path with a
  bounded authenticated callback request removed the warning; a full remote
  upload/retry/read/restore/delete run passed under `NODE_OPTIONS=--trace-warnings`.
  `@aws-sdk/client-s3` 3.1156.0 is Apache-2.0 and passed the dependency audit.

## Replicated repository workflow verification

The opt-in development adapter is now connected to repository create, proposal,
merge and read operations, but has not been enabled for live records. Root
tests exercise ephemeral working copies and synthetic storage. Disposable DB
tests additionally verify concurrent CAS conflicts, forced SQL rollback between
proposal insert and checkpoint update, backup failure with unchanged metadata,
tenant isolation, Git-backed proposal review content and backup recovery reads.
Snapshot version 2 preserves actual `proposal-<UUID>` refs; version 1 remains
readable. Neither synthetic transports nor disposable DB receipts establish
live R2 availability, production activation or signed-in browser acceptance.
The current App Storage smoke also passed with an 830-byte version-2 synthetic
snapshot: named proposal/main recovery, retry idempotency, denied anonymous
access and verification-object cleanup, with no SDK listener warning.
See `docs/REPOSITORY-STORAGE.md`.

## Reproduce

```sh
pnpm run typecheck
pnpm run test
# Optional operator-only provider smoke tests; the R2 command writes a synthetic object.
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts
# Run only after configuring a private R2 bucket and its workspace Secrets.
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts --r2
# Both configurations required. Verifies both immutable copies, then restores from R2.
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tools/verify-private-snapshot-archive.ts --dual
NODE_ENV=test pnpm --filter @workspace/scripts exec tsx --test \
  ../artifacts/api-server/src/tests/commons.test.ts
node --test tools/gitai-offline.test.mjs
python3 tools/test-network-denied.py
pnpm --filter @workspace/scripts exec node src/gitai-browser-test.mjs
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/src/tests/private-repository-archive.test.ts
PORT=22891 BASE_PATH=/ pnpm --filter @workspace/gitai run build
pnpm audit
```

Browser test uses a Nix-compatible `chromium` resolved from PATH; a stock
Playwright-downloaded Chromium failed to launch due to missing system shared
libraries. Linux kernel seccomp/prlimit and PostgreSQL are test prerequisites.
The DB test queues a connection search-path initialization; current pg emits a
deprecation warning about queued queries. Tests pass but that test harness must
be adjusted before pg 9. No application query uses that test initialization.

## What is NOT verified or NOT implemented

- **Signed-in browser mutations were not exercised.** Server domain workflows
  were exercised with synthetic identities in the disposable schema; actual
  browser sign-in was checked only as far as the email form. No test account was
  created/admitted and no auth bypass was added.
- Public owner assignment and community admission have not been approved.
  No automatic first-user admin, invitation delivery or accepted invitation.
- Repository membership beyond owner-only access, collaborative multi-user
  review policies, Git clone/push transport and source-history migration are not
  implemented. The canonical upstream was not rewritten or remotely modified.
- Git object storage is local development filesystem storage, ignored by Git and
  deployment packaging. **It is not production-durable storage.** Provision an
  independently backed-up repository service/volume before production; copying
  only the metadata database would lose repository objects.
- CLI records are separate from browser DB records. Signed events, trust-key
  pinning, revocation, browser bundle ingestion/export and concurrent CLI writers
  remain unimplemented. Checksums are not signatures; bundles are unencrypted.
- Services are searchable offers/requests/drafts, not a complete contracting
  marketplace. Bids/subcontracts, milestones, deliveries, disputes, substantiated
  reviews and legal operator verification remain to build.
- Package/artifact publishing, bounties, integration capability manifests,
  malware/secret/license scan pipeline and real code workspaces/previews are not
  implemented. No package/MCP server is installed from a submission.
- No LLM calls, collectors, external opportunity discovery, advertisements,
  real payment ledger, refunds processed by a provider, payout, escrow, token,
  chain, wallet/key generation or exchange.
- No production database, deployment or provider sandbox
  onboarding/checkout/webhook reconciliation was exercised. Local API and
  frontend production bundles were built, but this is not a deployment test.
- Accessibility uses labels, semantic controls, visible focus, reduced motion
  and responsive checks; this is not a complete WCAG audit.
- Upstream Gitai's complete build was not executed and only selected source
  files/sections were read. See SOURCE-AUDIT.md for exclusions.

## Dependency and credential review

New auth packages verified on npm as real packages:
`@clerk/express 2.1.80`, `@clerk/shared 4.40.0`,
`http-proxy-middleware 4.2.0`, `@clerk/react 6.17.8`,
`@clerk/themes 2.4.57` (MIT).
`zod 4.6.7` and React/ReactDOM `19.1.4` are MIT.
`playwright 1.64.1` is Apache-2.0 (development tests only).
Auth keys were provisioned through the managed setup and referenced at runtime;
no key values were inspected, hardcoded, returned or put in Git/model prompts.

Latest pnpm and Replit dependency audits: **0 critical, 0 high, 0 moderate,
0 low**.
Vite is now 7.3.7 and markdown-it is 14.3.3, both selected from patched releases
and verified as MIT before installation. The formerly remaining advisory
`GHSA-vfj7-8cjw-p6xm` for `braces 3.0.3` was withdrawn by GitHub at
2026-10-23T12:53:02Z. The package version is unchanged, and the issue was not
suppressed or claimed patched. Both the current pnpm audit and Replit's dependency
scanner report zero advisories. Earlier lockfile/targeted fixes for proxy-addr, source-map-js, fast-uri,
brace-expansion and selector-parser remain present. Recheck dependency status
for the exact future release head.

Data classes: operator display/profile content and hashed auth subjects are
stored; email/password handled by Clerk, not this database. No cards/CVV/bank/ID
documents, wallets, raw private conversations or payment credentials collected.
Logging omits request bodies, URLs, raw IPs and auth headers; errors are generic
for internal failures. Full data erasure, legal retention policy and moderation
operations still require review; withdrawal is not a promise of forensic erasure.

## Release decision and rollback

**NO-GO for production or publication from the current task branch.** The
absent repository license/three development plugin license declarations,
non-durable Git storage, authenticated browser acceptance, owner designation and
privacy/moderation review remain. The branch comparison and merge-tree review
were historical, not rechecked against a current upstream ref: they found an
18-commit divergence and 20 conflicts, with a direct PR removing upstream
identity and `code-gate` safeguards. No PR was opened. Re-pin refs and review the
current tree before publication. The recent cursor-paged/resumable personal-export
path is not covered by this verification, and saved-export
cleanup at sign-out/expiry was not exercised. Runner/payments/admission cannot
be enabled merely by setting a success flag.

Changes are additive to the existing workspace. No existing data tables were
dropped or migrated to a different provider. To undo code changes, use a Replit
checkpoint after reviewing the schema/data implications. The new metadata table
and ignored Git runtime data must be preserved/exported before any cleanup;
removing UI files alone is not a data backup. Never reinitialize the canonical
Gitai repository or force-push as a rollback method.
