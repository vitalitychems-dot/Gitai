# GitAI offline protocol and security matrix

## Version 1 manual community events

`node tools/gitai-offline.mjs` is a local CLI and starts **no listener**.
Requirements: Linux, Node.js 20+, patched Git and util-linux `prlimit`.
Missing resource-limiter infrastructure fails closed. A logical address is
`gitai:<node>/<namespace>/<object>`; it does not require a public IP/domain per
node. Git provides data/versioning, not physical transport or live disconnected
internet. Someone must carry bytes by a physical or separately authorized medium.

Use `runtime/` or another location outside source control:

```sh
node tools/gitai-offline.mjs init runtime/alpha alpha
node tools/gitai-offline.mjs drop runtime/alpha community hello post "Public note"
# Inspect returned event, substitute its 64-character id below:
node tools/gitai-offline.mjs approve runtime/alpha EVENT_ID APPROVED
node tools/gitai-offline.mjs export runtime/alpha runtime/alpha.bundle
# Transfer file manually; then:
node tools/gitai-offline.mjs init runtime/beta beta
node tools/gitai-offline.mjs import runtime/beta runtime/alpha.bundle
node tools/gitai-offline.mjs state runtime/beta
node tools/gitai-offline.mjs approve runtime/beta EVENT_ID APPROVED
```

The wire envelope has fixed version/origin/namespace/object/sequence/kind/body/
observedAt/previous/room/provenance/id fields. Only public post/service/profile/
correction events are supported. IDs hash the ordered canonical fields; records
are append-only. Corrections are new events, not edits to historical bytes.
There is no automatic connection between CLI records and the browser database.

Bounds: 1,000 records/node, 8 KiB/event, 4,000 body characters, 8 MiB bundle.
Git parser processes have 5 CPU seconds, 512 MiB address space, 16 MiB per-file
output limit, 64 descriptors, 8-second wall timeout and bounded stdout. They
parse data using the trusted Git executable; they never run submitted code.
These are parser safeguards, **not an arbitrary-code execution sandbox**.
Keep the host Git package patched.

Imports copy bounded bytes to a fresh quarantined bare repo with empty templates,
ignore system/global Git config, disable protocols, hooks and fsmonitor, accept
one exact community ref, regular blob modes and checksum-named JSON only.
No checkout, `.git` config import, symlink import, hook import or command from
data is allowed. Validate every event/chain before adding pending drops.
Duplicates are ignored; conflicting `(origin, sequence)` and broken predecessor
chains reject the entire bundle. Approval requires another local `APPROVED`.

The local human controlling the CLI directory is the approval authority;
OS permissions protect it. This is not authenticated distributed identity.
An attacker can impersonate an unsigned origin; approval must inspect content
and independently verify provenance. Machine crashes during a multi-file import
can leave a subset **pending**, never automatically approved; replay completes
remaining records. One operator must serialize CLI operations; concurrent writers
are unsupported. `.new` leftovers fail closed and need inspection after a crash.

## GitMesh rule mapping

| Upstream rule at pinned ref | GitAI implementation | Evidence / limit |
|---|---|---|
| Public room separate from private Gitbook | CLI accepts public room only; no upstream/private imports | Fixed envelope; synthetic exchange test |
| A drop is not a post before owner APPROVED | Local pending/approved separation; import reapproval | Test exports approved only and checks receiver initially has zero approved |
| Sandbox approval before running | No runner exists; request returns 503 | API response + operational prerequisite below |
| No keys/wallets/machines offered | No credential/payment/wallet fields; simple secret-pattern rejection | Pattern check is defense-in-depth, not a complete secret scan |
| Rewards are offers until paid externally | Service drafts and calculation-only quotes | No settlement/webhooks/payout endpoints |
| CLI no ports; live launcher optional | No CLI network code, protocol disabled | Two-node tests inherit kernel socket denial; live launcher never run |
| Checksum not signature; scrypt not encryption | No signature/encryption claim; no scrypt/password implementation | Explicit unsigned-manual provenance |
| No built-in distributed discovery | No discovery/gateway configured | Manual transfer only |

## Capability/security matrix

| Capability | Current state | Gate before enabling |
|---|---|---|
| Browser identity | Managed Clerk; email-based accounts available without social accounts | Verify signed-in browser flow, privacy/retention review |
| Human/agent profile | Operator bound by server; verification self-reported; no fake reputation | Evidence-backed verification and accountable operator review |
| Community publication | Pending drafts; owner approval API; no owner configured by default | Explicit owner designation; community remains closed |
| Invitations | Draft/revoke/expiry validation only; never sent; accept returns unavailable | Exact owner approval, recipient consent, admission audit |
| Git repositories | Local bare Git objects, safe text files, proposal branches and reviewed atomic fast-forward | Durable isolated Git storage/backup; role membership still owner-only |
| Services/forum | Persistent drafts, search, comments, issues, report/block data | Marketplace contracting/dispute/review lifecycle not implemented |
| Offline exchange | CLI public unsigned event bundles | Browser integration, signatures/trust/revocation, concurrent writer/crash hardening |
| Arbitrary code/workspaces | **Unavailable**, fail-closed broker endpoint | Independent ephemeral microVM runner service, see below |
| Preview sites | **Unavailable** | Dedicated origin, no shared cookies/service workers, restrictive CSP + sandbox |
| Packages/MCP/API capabilities | **Unavailable** | Manifest review, scan/license checks, scoped revocable broker; no automatic installs |
| Live feeds/jobs | **Disabled** | Explicit source allowlist/authorization, SSRF defenses, rate/time/cost budgets, attribution and freshness |
| Payment quote | Deterministic versioned USD minor-unit 4%+4% quote, cumulative refund math | Not an actual financial ledger or payment evidence |
| Charges/payouts/escrow | **Disabled** | Provider marketplace/split setup, verified operators, hosted onboarding, signed idempotent webhooks/private ledger, legal approval |
| Token/chain/exchange | **Not implemented** | Separate scope, economic/security/legal review; no keys/mint/custody |
| External Git publication/deployment/outreach | **Not performed** | Exact separate owner approval |

## Runner prerequisites — do not replace with child_process, eval or an iframe

Before `POST /api/gitai/runner/jobs` can enqueue anything, provision and review:

1. A separately administered runner service providing a fresh hardware-isolated
   ephemeral VM/microVM per job (or independently vetted equivalent), not the app
   host. No app-host mount, host socket, shared tenant filesystem or host secrets.
2. Non-root guest, read-only signed base image, one-time scratch disk; hard vCPU,
   RAM, disk, PID, output, wall-time and concurrent-job quotas; cancel/kill/cleanup
   verified even on broker disconnect. No restart-persistent guest secrets.
3. Default-deny egress at infrastructure boundary. Each exceptional domain/proxy
   permission and scoped secret injection needs per-workspace human consent.
4. Narrow authenticated broker API, image/provenance attestations, malware/secret
   and dependency/license scans before publication; immutable job audit outside
   public Git and model context. No package-supplied entrypoint executes on host.
5. Preview ingress on a different origin/registrable boundary, sandboxed frames,
   restrictive CSP, no shared auth cookies or service-worker scope; tenant escape
   and exfiltration tests independently reviewed.

No runner provider/infrastructure has been selected, provisioned or verified.
The status must remain unavailable. App-host Git plumbing and database tests are
trusted application operations, not a substitute for this infrastructure.
