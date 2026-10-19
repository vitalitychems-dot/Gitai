# GitAI source intake and provenance

## Identity and boundaries

Canonical existing repository: **https://github.com/vitalitychems-dot/Gitai**
(capitalization returned by GitHub). This workspace continues GitAI; it is not
Tessera, Gitbook, a GitMesh upstream replacement or a new competing repository.
No remote was configured, repository reinitialized, force push performed, source
repository modified, invitation sent, deployment performed or external publication
attempted. The workspace's preexisting Git history remains in place.

Audit used unauthenticated GitHub repository metadata, Git object tree indexes
and narrowly selected raw files. A tree entry is **inventory, not a file read**.
No upstream install scripts, Git hooks, launchers or packages were executed.
GitHub's `size` field is metadata in KiB, not measured download size.

## Pinned coverage

| Source | Pinned ref | Actual coverage | Exclusions / limitations |
|---|---|---|---|
| vitalitychems-dot/Gitai | `cfb7e8af9ab15738056d3889bfbbb79250ecdd99` main | Metadata: 214 KiB, no detected repository license. Recursive file index. Read root package.json/replit.md, complete API route and seed file, frontend package manifest; downloaded App.tsx/CSS and inspected selected presentation/auth sections, not all UI code. | `.agents` contents excluded. Wallet/staking/token code excluded from reuse. No historical commits imported. No claim all indexed files read. |
| vitalitychems-dot/GitMesh | `470219b795abe4126a36a2465ef7d78dadcd4e0c` main | Metadata: 1,071 KiB; root/recursive file indexes. Read README, RULES, mesh/DOOR, mesh/TUNNEL, projects/local-vault/README completely. Current ref matches supplied prior ref. | Local-vault executable, sync publisher, live launcher, runtime vault and protected data **not read/imported/run**. No changes upstream. No repository license detected. Documentation lessons only. |
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

## Build evidence and integrity

Upstream Gitai build **not run**: source was not cloned/installed. Its manifest
identifies pnpm/TypeScript/Express/Vite and Clerk. Running an entire unaudited
source tree would violate intake constraints. Current workspace build/typecheck
and actual tests are documented separately in VERIFY.md.

The CLI event envelope, local reapproval/quarantine rules, parser resource limits
and network-denied tests are **GitAI extensions**. SHA-256 is an integrity checksum,
not a signature. Signed trust/revocation is not implemented.
