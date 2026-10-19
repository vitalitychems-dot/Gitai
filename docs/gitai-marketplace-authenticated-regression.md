# GitAI marketplace authenticated regression replay

This is a credential-free replay guide for one synthetic buyer/seller marketplace
journey. It uses Clerk's E2E-only `signInClerkUser` helper; do not use the Clerk
sign-up/sign-in UI, real accounts, stored cookies, or saved auth tokens. Run with
the GitAI web workflow at `/` and API workflow at `/api`.

## Start and identities

1. Use the Playwright E2E runner that provides `signInClerkUser` and
   `newBrowserContext`. Locate the local system browser with `which chromium`;
   pass that executable path when the runner supports it. Set `baseURL` to
   `https://${REPLIT_DEV_DOMAIN}` and navigate each context to `/marketplace`.
2. Generate a fresh run suffix with `nanoid()`. Use distinct synthetic identities,
   for example `buyer-${suffix}@example.com`, `seller-${suffix}@example.com`,
   and optionally `outsider-${suffix}@example.com`. For each identity call
   `signInClerkUser({firstName:"Synthetic",lastName:"Buyer"|"Seller"|"Outsider",
   email,basePath:"/marketplace"})` and navigate that context to the returned URL.
   Keep each identity in an independent browser context. Use a fourth fresh,
   unsigned context for the anonymous visibility check.
3. Read the signed-in seller subject from its authenticated `/api/gitai/state`
   response. Do not alter `GITAI_OWNER_SUBJECT`, owner configuration, or existing
   records. If no approved offer is available, insert one unique synthetic
   approved service row into `gitai_records` with a generated UUID, the synthetic
   seller subject as owner, `kind='service'`, `status='approved'`, `namespace=NULL`,
   and `data={"category":"synthetic-regression","subtotalMinor":25000,
   "deadlineDays":30,"offerType":"offer"}`. Save that row ID for cleanup. Reload
   the buyer marketplace to see the offer.

## Journey and verifications

1. As buyer, open `button-bid-<serviceId>`. Fill
   `input-bid-scope`, `input-bid-price` (`100`), `input-bid-deadline`, milestone
   0 title/scope/due (`input-milestone-title-0`,
   `input-milestone-scope-0`, `input-milestone-due-0`), add milestone with
   `button-add-milestone`, then fill milestone 1 title/scope/due and
   `input-operator-bid-<serviceId>`. Confirm the quote is buyer `$104.00`,
   seller `$96.00`, platform `$8.00`. First leave
   `checkbox-consent-bid-<serviceId>` unchecked and confirm
   `button-submit-bid` is disabled; then check the box and submit the bid.
2. Refresh seller. In `card-bid-<bidId>`, fill
   `input-operator-c-<bidId>`, check `checkbox-consent-c-<bidId>`, and click
   `button-consent-<bidId>`. Confirm status `active` and both consent rows.
3. In the seller delivery form, select milestone 0, enter a delivery note, check
   `radio-executable-yes-<bidId>`, and click `button-deliver-<bidId>`. Verify a
   503 refusal (browser console/network), the refusal notice, active agreement
   status, and no persisted delivery event. Change to executable No and record a
   manual-only delivery with an HTTPS reference URL; the UI says links are never
   fetched.
4. Refresh buyer and reject milestone 0 using
   `input-decide-note-<bidId>-0` and `button-reject-<bidId>-0`. Refresh seller,
   verify milestone 0 is offered again, and resubmit it manually. Refresh buyer,
   accept that latest delivery via `input-decide-note-<bidId>-0` and
   `button-accept-<bidId>-0`.
5. Seller manually delivers milestone 1 using `select-deliver-milestone-<bidId>`,
   `input-deliver-note-<bidId>`, `input-deliver-url-<bidId>`,
   `radio-executable-no-<bidId>`, and `button-deliver-<bidId>`. Refresh buyer,
   accept with `input-decide-note-<bidId>-1` and
   `button-accept-<bidId>-1`; confirm both milestone rows accepted and status
   `completed`.
6. Each participant submits a 5/5 review using
   `select-review-event-<bidId>` set to an acceptance event,
   `radio-rating-5-<bidId>`, `input-review-note-<bidId>`, and
   `button-review-<bidId>`. Confirm both reviews cite an accepted event and are
   visible only in participant views.
7. As either participant, select an acceptance event in
   `select-dispute-event-<bidId>`, fill `input-dispute-note-<bidId>`, and click
   `button-dispute-<bidId>`. Add corroboration with `input-evidence-note-<bidId>`,
   optional HTTPS `input-evidence-url-<bidId>`, and `button-evidence-<bidId>`.
   Fill `input-resolution-note-<bidId>` and submit using
   `button-propose-resolution-<bidId>`. Refresh the other participant, inspect
   the proposal, and click `button-agree-resolution-<bidId>`. Reload and confirm
   status `resolved` and both principals in the agreement list.
8. Reload anonymous and synthetic outsider `/marketplace` contexts. The approved
   offer should remain public, but `card-bid-<bidId>`, private review notes,
   dispute evidence, and resolution text must not appear.
9. At 390px viewport width, compare
   `document.documentElement.scrollWidth` with `innerWidth` to check horizontal
   overflow. Record the result rather than changing application CSS during the
   regression.

## Cleanup and scope

In a `finally` block, delete **only** the saved UUIDs for the synthetic service
and bid rows, after verifying their IDs and kinds. Do not delete by owner, title,
or run-wide query, and do not modify unrelated rows. Do not save any Clerk
session material.

This browser journey does not exercise subcontract consent or withdraw actions;
the disposable DB integration suite is the coverage source for those cases. No
provider, charge, payout, runner, deployment, or external evidence fetch is part
of this replay.

## Focused mobile follow-up result

After the marketplace owner-line wrapping and bid/agreement min-width/overflow
changes, a focused 390×844 check used only synthetic layout fixtures (one public
offer, one active agreement, and one completed agreement; no actions were
submitted). On both signed-in buyer and seller pages,
`document.documentElement.scrollWidth` and `document.body.scrollWidth` were
375px at a 390px viewport. The listing's full 64-hex seller owner line wrapped
within the card. Active delivery-milestone, dispute-event, and completed
review-event selects were each 267px wide with `min-width: 0`, `max-width: 100%`,
and bounds x=54..321, within the viewport. The earlier 459px overflow was not
reproduced. The temporary service and both agreement fixtures were deleted by
their exact UUIDs after the measurements.
