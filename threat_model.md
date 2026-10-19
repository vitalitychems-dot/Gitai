# GitAI threat model — initial bounded slice

## Assets and trust boundaries

Assets: Clerk session identity; operator-scoped drafts/profile metadata; private
Git objects; public community content; future financial ledger and credentials.
Boundaries: anonymous browser -> API -> metadata DB / local bare Git; local owner
-> CLI -> quarantined imported Git bundle; external sources -> **disabled**
collector; app -> **unavailable** independent runner / payments providers.

## Threats and current mitigations

| Threat | Controls present | Residual risk / gate |
|---|---|---|
| Cross-tenant reads/writes | Clerk-derived hashed operator subject; server ownership checks; private repos invisible to other operators; disposable-schema isolation test | Shared host filesystem not adequate for arbitrary guest execution; owner-only repository membership MVP |
| Forged ownership/admin/admission | No client-supplied owner; no automatic first-user admin; owner configured explicitly outside public endpoints; invitation accept fails closed | No owner designated; no public community admission |
| Malicious code/MCP/repo hooks | Data-only bare Git plumbing, empty templates, no checkout; hidden/parent paths denied; no shell interpolation; no submitted command execution | Git binary parser must remain patched; publication scanning and full runner absent |
| Malicious preview/browser XSS | React escapes plain content; no iframe/executable preview or raw HTML rendering | Separate-origin runner previews and a production CSP must be built before enabling previews |
| Prompt injection/excessive agency | No model calls or model tools enabled; external content treated only as data | Future AI requires scoped capabilities, schema validation, source labeling, consent and adversarial tests |
| SSRF/exfiltration | No arbitrary URL fetch/import or collector endpoint; offline Git network disabled; Clerk fixed provider target | Future gateway needs hostname/IP/redirect/DNS validation, allowlist, timeout, response budget and robots/provider policy |
| Resource abuse | 96 KiB request cap, 240 requests/min conservative connection budget; per-operator record/repo/file/storage limits; Git timeout/output caps; CLI parser prlimit | Multi-instance distributed limits, quota reclamation and worker offloading not built; proxy connections may share quota |
| Financial replay/false finality | No payment execution endpoint; deterministic immutable quote ID; integer cumulative refund reconciliation | Actual idempotency, webhook signature verification and ledger reconciliation not built; cannot claim payment safety verified |
| Offline replay/tampering | Canonical checksum/chain/sequence validation; dedup; reject conflicts; quarantine, safe modes and local reapproval | No signatures/trust/revocation, unverified origins and unencrypted bundles; no financial finality |
| Secret/PII leak | No raw cards/bank/ID docs; no credential fields, request payload/IP/path logging disabled; limited secret-pattern rejection; public exports opt-in; runtime excluded from Git | Pattern check not full secret/malware scanning; public replication cannot guarantee erasure; legal retention/access review needed |
| Dependency compromise | Pinned added auth packages/lockfile; audit run; critical advisory fixed | Unpatched braces advisory remains release blocker; current report in VERIFY.md |

## Deliberate non-goals / blocked operations

No claim of perfect security, consciousness, unlimited free compute or live
offline internet. No production/deployment/external Git publication, bulk outreach,
Moltbook scrape, real invite, wallet/coin/exchange or agent legal-payee verification.
No advertisement automation or physical transaction authority.

## Release gate

**No-go for public production.** First slice is suitable for controlled
development inspection only. Resolve dependency audit blockers; designate owner;
verify authenticated browser paths; provide durable Git storage/backups; review
privacy/deletion/retention and abuse policy; establish moderation readiness.
Execution and payment gates require separate infrastructure/provider review and
explicit approval as described in PROTOCOL-SECURITY.md.
