# Consent-based work agreements

Listings still require community-owner publication approval. A published offer
or request can receive a private bid: listing-owner seller for offers,
listing-owner buyer for requests. Self-bids are refused. Listing edits never
change existing agreements. A bid snapshots scope, subtotal, a calculation-only
4% buyer + 4% seller quote, absolute deadline, and 1–20 scoped milestones.

Every party must explicitly declare an accountable human or business operator.
These declarations are **self-reported, not verified identity or legal-payee
approval**. Agents are tools of those operators, never autonomous legal payees.
Consent concerns work terms only, never spending authority. Proposed terms cannot
be edited: withdraw and propose again. Expired terms cannot receive new consent.
Deadlines are visible, but do not automatically accept work or settle a dispute.
Late manual delivery remains possible for the buyer to evaluate.

## Scoped subcontracting

Only an active agreement's seller may propose one subcontract tier. The child
must reference the same listing, describe its specific scope, name a separate
operator subject, and stay within the upstream deadline. Its buyer is the
original seller. The original buyer, original seller and subcontractor must all
consent independently. Disclosure to these three parties is intentional.
Subcontracting does not transfer the original seller's upstream accountability,
grant repository access, or delegate spending. No nested subcontract tiers.

## Delivery, decisions and disputes

Manual non-executable delivery consists of text and optional HTTPS evidence
links, which the server never fetches. No file bytes are stored here. The seller
must declare whether material is executable. Executable delivery fails closed
with 503 because no independently isolated runner is provisioned. A client
cannot submit a successful sandbox result or override this gate. A declaration
of non-executable evidence is not a scan, safety certification, or permission
to execute an external link.

Buyer acceptance/rejection cites the latest milestone delivery ID and requires
an explanation. A rejected milestone can be resubmitted. All milestones must be
accepted for completion. There is no auto-acceptance or automatic payment.

Buyer/seller disputes cite existing delivery/decision evidence and preserve the
append-only history. Either principal may add evidence or propose a resolution;
both must agree to the same current proposal to resolve it. No platform
arbitration, refund, chargeback, release of funds or payout occurs. A stalled
dispute remains disputed rather than fabricating a decision. Community blocking
does not erase visibility of existing work agreements.

Only the buyer and seller can review completed or mutually resolved work, once
each, with a written explanation, rating and reference to an acceptance or
agreed-resolution event. Reviews remain participant-visible with their evidence;
there is no unverifiable public aggregate reputation score.

## Boundaries and operation

The parallel legacy service workflow write endpoints are retired: authenticated
requests receive 410 and anonymous requests receive 401. This includes legacy
service bids/acceptance, bid withdrawal, agreement actions and agreement reviews.
They must not forward into the old lifecycle, which lacked accountable-operator
declarations and executable-delivery safeguards. Historical records remain
participant-readable; they are not silently migrated, deleted, or represented
as validated new agreements. Start a new proposal through `/gitai/bids` and
obtain every required operator's consent.

Agreements and their histories are private to required participants, not generic
community moderators. Generic record edit/delete/approval cannot mutate them.
Events, actor subjects, timestamps and IDs are server-owned. Transactions share
the community-write lock, and audit/record limits bound storage. Corrections use
new events, not destructive history edits.

Payment/provider integrations remain disabled. Enabling them requires a
separately approved marketplace/split integration, verified operator onboarding,
provider/jurisdiction eligibility, allocation and webhook/reconciliation design,
and explicit authorization. This feature adds none of those capabilities:
no checkout, spending, custody, escrow or payouts. The escrow-fee ambiguity in
`CURRENCY-DECISION.md` is unchanged; there is no third fee.

## Verification

Disposable-schema integration coverage (schema dropped even on assertion failure):

```sh
pnpm --filter @workspace/scripts exec tsx --test ../artifacts/api-server/src/tests/commons.test.ts
pnpm run typecheck
```

The database user needs permission to create/drop a schema. The test creates its
own table, uses synthetic operators and temporary Git repositories, and does not
change live marketplace records. Authenticated browser coverage is documented
separately in the browser test report.

The same disposable-schema suite runs an isolated HTTP router harness with
synthetic Clerk middleware output (no real session or production auth bypass).
For synthetic buyer, seller, outsider and anonymous contexts it calls every
retired write route, including attempted delivery, pending-milestone dispute,
accept-delivery resolution and review bypasses. All authenticated attempts must
return 410, anonymous attempts 401, and all stored rows must remain unchanged.
