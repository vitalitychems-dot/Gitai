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

An authenticated synthetic buyer/seller browser journey exercised proposal,
consent, executable 503 refusal, manual rejection/resubmission, two milestone
acceptances, both reviews, dispute/evidence and mutual resolution with reload
persistence. Anonymous and outsider views excluded private work data. Synthetic
fixtures were removed by their exact IDs. See
`gitai-marketplace-authenticated-regression.md` for replay details and responsive
checks. Subcontract and withdrawal browser forms were not exercised in this
pass; their state/authorization rules have disposable DB coverage.

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
- Marketplace navigation attention count unit test passed. Buyer consent/delivery,
  seller consent/milestone deadlines, unrelated callers and signed-out identity
  all use the same attention-item collector as the Marketplace page.
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
- GitAI package TypeScript check and production Vite build passed. `/api/healthz`
  returned 200 during verification; the browser suite's anonymous API checks
  passed. No deployment, external Git push, outreach or financial operation
  performed.

## Reproduce

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server exec esbuild src/tests/commons.test.ts \
  --bundle --platform=node --format=cjs --external:pg-native \
  --outfile=dist/commons.test.cjs
node --test artifacts/api-server/dist/commons.test.cjs
python tools/test-network-denied.py
node scripts/src/gitai-browser-test.mjs
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
- No production database, production build/deployment or provider sandbox
  onboarding/checkout/webhook reconciliation was exercised.
- Accessibility uses labels, semantic controls, visible focus, reduced motion
  and responsive checks; this is not a complete WCAG audit.
- Upstream Gitai's complete build was not executed and only selected source
  files/sections were read. See SOURCE-AUDIT.md for exclusions.

## Dependency and credential review

New auth packages verified on npm as real packages:
`@clerk/express 2.1.80`, `@clerk/shared 4.40.0`,
`http-proxy-middleware 4.2.0`, `@clerk/react 6.17.8`,
`@clerk/themes 2.4.57` (MIT).
`zod 4.3.6` and React/ReactDOM `19.1.4` are MIT.
`playwright 1.64.1` is Apache-2.0 (development tests only).
Auth keys were provisioned through the managed setup and referenced at runtime;
no key values were inspected, hardcoded, returned or put in Git/model prompts.

Audit after fixes: **0 critical, 1 high, 0 moderate, 0 low**.
Remaining high: `braces 3.0.3`, transitive through `micromatch` in the canonical
Clerk proxy dependency and existing mockup tooling; audit advertises no patched
version. It was **not suppressed** or accepted as safe. Patched proxy-addr,
source-map-js, fast-uri, brace-expansion and selector-parser were applied through
the lockfile/targeted overrides. A provider/dependency fix or reviewed replacement
is required before release.

Data classes: operator display/profile content and hashed auth subjects are
stored; email/password handled by Clerk, not this database. No cards/CVV/bank/ID
documents, wallets, raw private conversations or payment credentials collected.
Logging omits request bodies, URLs, raw IPs and auth headers; errors are generic
for internal failures. Full data erasure, legal retention policy and moderation
operations still require review; withdrawal is not a promise of forensic erasure.

## Release decision and rollback

**NO-GO for production.** Dependency advisory, durable Git storage, authenticated
browser acceptance, owner designation and privacy/moderation review remain.
Runner/payments/admission cannot be enabled merely by setting a success flag.

Changes are additive to the existing workspace. No existing data tables were
dropped or migrated to a different provider. To undo code changes, use a Replit
checkpoint after reviewing the schema/data implications. The new metadata table
and ignored Git runtime data must be preserved/exported before any cleanup;
removing UI files alone is not a data backup. Never reinitialize the canonical
Gitai repository or force-push as a rollback method.
