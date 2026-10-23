# GitAI source intake and provenance

## Identity and boundaries

Canonical existing repository: **https://github.com/vitalitychems-dot/Gitai**
(capitalization returned by GitHub). This workspace continues GitAI; it is not
Tessera, Gitbook, a GitMesh upstream replacement or a new competing repository.
The existing `origin` points to this canonical repository and was fetched
read-only for review; the workspace's preexisting Git history remains in place.
No remote ref was changed, source was reinitialized, force-push performed,
invitation sent, deployment performed or external publication attempted.

Audit used unauthenticated GitHub repository metadata, Git object tree indexes
and narrowly selected raw files. A tree entry is **inventory, not a file read**.
No upstream install scripts, Git hooks, launchers or packages were executed.
GitHub's `size` field is metadata in KiB, not measured download size.

## Pinned coverage

| Source | Pinned ref | Actual coverage | Exclusions / limitations |
|---|---|---|---|
| vitalitychems-dot/Gitai | `cfb7e8af9ab15738056d3889bfbbb79250ecdd99` main | Metadata: 214 KiB, no detected repository license. Recursive file index. Read root package.json/replit.md, complete API route and seed file, frontend package manifest; downloaded App.tsx/CSS and inspected selected presentation/auth sections, not all UI code. | `.agents` contents excluded. Wallet/staking/token code excluded from reuse. No historical commits imported. No claim all indexed files read. |
| vitalitychems-dot/GitMesh | `470219b795abe4126a36a2465ef7d78dadcd4e0c` main at initial review | Initial coverage: README, RULES, mesh/DOOR, mesh/TUNNEL and projects/local-vault/README. GitHub now redirects the old repository URL to `vitalitychems-dot/network`; its main is `fc5435de9bfafd18d536583e68d6283436e4f5b8` (3,674 KiB, no detected license), 16 commits ahead of the supplied pin. Current README, RULES and the beginning of `docs/SECURE-DATA-FLOW.md` were read; the new document describes GPG/age encryption and signed provenance. | Compare reported 27 changed paths, including local-vault code/tests, bundle tools and new data-flow documentation. Changed local-vault executables, test bodies, sync publisher, live launcher, runtime vault and protected data **not read/imported/run**. No changes upstream. GitAI remains unsigned and unencrypted as documented in VERIFY.md; only public documentation lessons inform GitAI. |
| reconurge/flowsint | `64ac40d3f696b2ff51701541332067813ca72496` main | Metadata: 65,333 KiB; repository license Apache-2.0. Read the README and `ETHICS.md` only. A graph-based OSINT investigation platform with domain, IP, social, email and other enrichment features. | No code, dependencies or enrichers imported or executed. GitAI scope is a read-only graph of public GitAI posts and source links only; no recon, enrichment, scanning or member scraping. |
| vitalitychems-dot/Gitbook | `ed00c77ca6345c31b0316c03c0204d89f8bf601a` main | Metadata: 6,181,328 KiB; **root index only** and public README. | Archive/backup trees listed but not expanded. Storage/archive manifest bodies not read because public README confirms private intake/history boundaries. No bulk fetch, private memory, raw conversations, vault or customer data. License undetected. Coverage deliberately partial. |
| vitalitychems-dot/combined | unavailable | Repository API returned HTTP 404 unauthenticated. | Could be private, missing, renamed or otherwise inaccessible; no inference. Cannot pin or inspect manifests. |
| vitalitychems-dot/box-backup-2026-10-13 | unavailable | Repository API returned HTTP 404 unauthenticated. | No archive retrieval, ref pin or manifest inspection possible. |
| vitalitychems-dot owner account | supplied identity only | Supplied repository ownership checked via repository metadata. | No account-wide scrape, guessed recipients or outreach. |
| Tessera | no exact source ref supplied for direct audit | Gitbook public README confirms separate application boundary. | No Tessera source or private memory imported. Owner's handoff-only rule applies. |
| “REA REPO/Reddit” | unspecified | Missing exact repository/reference recorded. | No invented source. |
| Five screenshots and text conversation in another chat | unavailable here | Not accessed. | No claims about their contents or verified consciousness requirements. |

## Reuse and license decision

Gitai's root package identifies the workspace as MIT, but the API reports no
repository-level license and no LICENSE file appeared in the inventory. This is
**not proof of blanket third-party redistribution rights**. The owner explicitly
authorized continuing their own source. GitAI keeps that identity and refactors
its working-commons product/navigation/auth presentation patterns. New backend
work replaces unsafe behavior rather than importing the repository wholesale.
The owner must confirm licensing of their code and assets before external release.

Specifically rejected: seed-only fictional agent profiles/stars/sales/activity,
unauthenticated counter inflation, URL metadata presented as a Git repository,
the prior wallet UI, meme-token stake/30-day lock assumptions and fee-wallet
configuration as prerequisites for ordinary services.

GitMesh and Gitbook have no detected license. Their public architectural rules
inform an original implementation; their executable source is not copied.
No upstream lockfile or install script was imported.

## Publication review recheck — 2026-10-23

- GitAI's latest canonical `main` was fetched read-only at
  `744f3ae679df23b428f49967ddb5c86620047d20`. The local task branch is
  `1ffa981f7f06289e2803e4b77878f4f1a8bc26e9`; their merge base is
  `0c05d76b9e518521a819bcdca13cfdf07cc61818`. The upstream is 18 commits
  ahead and the task branch is 10 commits ahead.
- A merge-tree review reported conflicts in 20 paths. The task branch's direct
  diff would also remove upstream `IDENTITY.md` and the `code-gate` workflow and
  scripts. Current `main` requires the `code-gate` check. A direct PR from this
  task branch would therefore erase unrelated identity/security work; no branch
  or PR was created.
- Current `main` has three existing draft PRs (#2, #6 and #7); none is this
  product change. The GitHub repository remains the owner's existing `Gitai`
  repository. No push or publication was made.
- The workspace package declares MIT, but the repository has no detected SPDX
  license or `LICENSE` file. Three Replit development plugins have no license
  metadata. Do not treat the package field as confirmation that all code/assets
  are cleared for external release.
- No Flowsint code or graph integration is in this workspace snapshot. The
  owner-selected read-only graph scope remains future work; graph views must
  not turn into OSINT enrichment or recon.
- Coverage remains selective. The owner-provided GitAI repo was not exhaustively
  read or built from a separate clone; no claim is made that every indexed file
  was reviewed. Gitbook was limited to its root index and public README.
  `combined` and `box-backup-2026-10-13` remain unauthenticated 404s. The other
  conversation's screenshots/text remain unavailable. No Tessera code, private
  memory, protected vault, secret-only artifact, customer data or payment
  credential was read or imported.

## Build evidence and integrity

Upstream Gitai build **not run**: source was not cloned/installed. Its manifest
identifies pnpm/TypeScript/Express/Vite and Clerk. Running an entire unaudited
source tree would violate intake constraints. Current workspace build/typecheck
and actual tests are documented separately in VERIFY.md.

The CLI event envelope, local reapproval/quarantine rules, parser resource limits
and network-denied tests are **GitAI extensions**. SHA-256 is an integrity checksum,
not a signature. Signed trust/revocation is not implemented.
