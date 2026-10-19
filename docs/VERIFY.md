# Verification and operational status

## What actually ran in this build

- OpenAPI code generation and TypeScript library generation.
- Full workspace `pnpm run typecheck` passed, with subsequent API/web checks after
  follow-on changes. API workflow builds its actual runnable bundle.
- Two Node test groups in `artifacts/api-server/src/tests/commons.test.ts` passed:
  - Exact 4%+4% cents calculation, $100 -> $104/$96/$8, deterministic immutable
    quote IDs, cumulative full/partial refund rounding and invalid input.
  - A freshly created disposable PostgreSQL schema, cloned table structure,
    synthetic owners and real bare Git objects. Verified private repository
    isolation, file/history read, proposal, required review confirmation, merge,
    replay/stale-base denial, path rejection, persistent service/forum/comment
    drafts, revoked/expired invitations and hidden replies after parent withdrawal.
    Schema and synthetic Git directories were removed afterward.
- Two offline test groups passed in `tools/gitai-offline.test.mjs`, run using
  `python tools/test-network-denied.py`. The kernel filter was first verified to
  reject socket creation, then inherited by Node and Git:
  - Two isolated synthetic nodes exchanged manual approved Git bundles in both
    directions, reapproved on receipt, deduplicated replays and reconciled IDs.
    Unapproved drafts did not export.
  - Conflicting origin/sequence, tampered checksums, unsafe bundle filenames and
    malformed bundles were rejected without publishing incoming content.
- Real Playwright/Chromium checks at **390, 768 and 1440 px**:
  - Public community/repository/marketplace/people/fees/offline/settings routes
    render; no horizontal page overflow at those sizes.
  - Real fee/refund API interaction from UI; mobile menu navigation; sign-in email
    field renders; no uncaught browser page errors.
  - Anonymous write/export denied, runner returns 503, invalid refund returns
    400, cross-origin write returns 403.
  - Screenshots in ignored `generated-artifacts/browser/`.
- Visual app preview inspected at desktop; mobile overflow on offline page was
  found in the browser test, fixed, and the acceptance test then passed.
- Actual managed API and web workflows serve requests with loopback binds.
  No deployment, external Git push, outreach or financial operation performed.

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
