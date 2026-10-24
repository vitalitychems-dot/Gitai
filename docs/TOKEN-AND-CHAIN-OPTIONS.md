# Token and chain options for GitAI

Status: decision draft, 2026-10-24. This is not legal advice. Every option that moves money or issues a transferable token needs review by a US securities / payments lawyer before launch. Facts are linked; anything without a link is labelled as an engineering judgement.

This doc answers Collin's request: "incentivize a coin … our own blockchain … maybe LoRa radio or Ergo … real backing … backed by power", plus encrypted git-NFT files and the "git-as-ledger" idea. It builds on `docs/CURRENCY-DECISION.md`, which already recommends **no GitAI token for the MVP**, and on the current fee code (`artifacts/api-server/src/lib/fees.ts`, USD 4% buyer + 4% seller, version `gitai-usd-4plus4-v1`).

## TL;DR recommendation

1. **Launch in US dollars** through a licensed payment processor. Keep the 4% + 4% fee. No coin. (Phase 1)
2. **Use git itself as the ownership and provenance ledger** for code, inventions and digital goods: real signatures (not the 32-bit djb2a mark), signed append-only refs, a platform notary countersignature, carried online or over the network repo's offline signed-bundle path. Money still settles in dollars. (Phase 2)
3. **Anchor ledger hashes publicly**: OpenTimestamps (free, Bitcoin-anchored) first; optionally Ergo or Solana transactions that carry the commit hash. This gives tamper-evident public timestamps without issuing a token. (Phase 3)
4. **Only then, and only after counsel signs off**, research a non-transferable compute-credit or an Ergo/Solana testnet token. Ergo is the better technical fit; Solana has more users. (Phase 4)
5. **Do not** do a pump.fun meme-coin launch, a revenue-share token, our own stablecoin, or a custom blockchain over LoRa.

Ranking (best first for GitAI right now): **Dollar-first + git-as-ledger** > **git-as-ledger + public anchoring** > **Ergo native token (later)** > **Solana SPL token, standard launch (later)** > **pump.fun launch** > **own chain over LoRa**.

## 1. Options compared

| | A. Solana SPL / pump.fun | B. Ergo native token | C. Own chain (+ LoRa) | D. Git-as-ledger | E. Dollar-first, token later |
|---|---|---|---|---|---|
| What exists today | Mature token program and NFT metadata standards | Mature eUTXO chain, token/NFT standards, stealth addresses | Nothing; build consensus, wallets, explorers | Network repo already signs/encrypts git bundles with GPG/age; GitAI has real git repos | Fee quote code exists; no processor yet |
| Engineering cost | Low to mint; high to do safely | Low to mint; moderate (ErgoScript) | Very high | Low–moderate (reuse git + existing scripts) | Low |
| Security model | Solana validators | Ergo proof-of-work | Ours, unproven; small chains are easy to attack | Signatures + notary/quorum; optional public anchor | Processor + our database |
| Offline / air-gap | No (needs chain to transfer) | No (needs chain to transfer) | Possible, but tiny bandwidth over LoRa | **Yes**: bundles move by USB/mesh; finality waits for notary/anchor | No |
| Privacy | Public ledger | Stealth one-time addresses (EIP-41) | Whatever we build | Encrypted bundles; plaintext metadata is visible (see §4) | Processor KYC |
| Legal risk | **Highest** for pump.fun (see §3) | Same securities analysis as any token | Same, plus building a payment network | Low if it records ownership and money settles in USD | Lowest |
| Real-money value | Market speculation | Market speculation | None until adopted | Value of the underlying goods, paid in USD | USD |

### A. Solana SPL token / pump.fun launch
- Tech: the SPL Token program mints fungible tokens and NFTs on Solana ([spl.solana.com/token](https://spl.solana.com/token)); Metaplex Token Metadata adds names, images and NFT data ([Metaplex docs](https://developers.metaplex.com/token-metadata)).
- pump.fun is a launchpad, not a legal shelter. Its operator, Baton Corp, is a defendant in a putative class action, *Aguilar v. Baton Corp d/b/a Pump.Fun*, S.D.N.Y. 1:25-cv-00880, filed Jan 30, 2025, alleging sales of unregistered securities ([docket](https://dockets.justia.com/docket/new-york/nysdce/1:2025cv00880/635992)). *Carnahan v. Baton Corp* was consolidated into it ([CourtListener](https://www.courtlistener.com/docket/69554149/carnahan-v-baton-corporation-ltd-dba-pumpfun/)); a later amended complaint added Solana-ecosystem defendants. Motions to dismiss were pending when last checked; nothing is decided.
- The SEC staff said on Feb 27, 2025 that typical meme coins are generally not securities, **but** that holders then get no securities-law protection, and that the view does not cover coins sold with promises of profit, utility, or the team's efforts ([SEC staff statement](https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins); [Commissioner Crenshaw's dissent](https://www.sec.gov/newsroom/speeches-statements/crenshaw-response-staff-statement-meme-coins-022725)). A "GitAI coin" that is marketed as backed, staked, fee-earning or tied to platform growth is **not** a plain meme coin under that statement. So "pump.fun is the most legal route" is not supported: the moment the coin is tied to GitAI's success it falls back into Howey analysis.
- The existing main-branch design ("seller locks GitAI meme coin worth 5% of each sale for 30 days") ties the coin to the platform's economy. Recommend dropping it (this branch already replaces it with the USD-only quote).

### B. Ergo
- eUTXO model with ErgoScript contracts built on Sigma protocols; proof-of-work consensus ([ErgoScript docs](https://docs.ergoplatform.com/dev/scs/ergoscript/)).
- Native tokens are first-class (no separate token contract); asset metadata standard EIP-4 ([docs](https://docs.ergoplatform.com/dev/tokens/standards/eip4/), [spec](https://github.com/ergoplatform/eips/blob/master/eip-0004.md)); artwork/NFT standard EIP-24 ([docs](https://docs.ergoplatform.com/dev/tokens/standards/eip24/)).
- **Stealth addresses**: a payer derives a fresh one-time address for the receiver with non-interactive Diffie-Hellman, so payments to the same person are not linkable on-chain ([Ergo stealth address](https://docs.ergoplatform.com/uses/stealth-address/), [EIP-41](https://raw.githubusercontent.com/ergoplatform/eips/d21280977f2c21dc733632c48c98d0f614bc6123/eip-0041.md)). These are cryptographic, not visual. (The "pixelated, moving" text in the Telegram screenshots is Telegram's spoiler blur, not an Ergo feature.) Saving one-time addresses "in a git" is possible as a receipt log, but the private spending material must never be committed.
- Fit: best technical match for GitAI's goals (cheap native tokens, eUTXO is easy to reason about for escrow-like scripts, privacy option, can carry a hash in a box register for anchoring). Smaller liquidity and fewer wallets than Solana. Legal analysis is the same as any token.

### C. Our own chain, including LoRa radio mesh
- Building consensus, wallets, explorers and exchanges is years of work, and a new low-hashrate / low-stake chain is cheap to attack. Engineering judgement: not worth it for GitAI.
- LoRa bandwidth is the hard limit. EU868 LoRaWAN data rates DR0–DR5 are 0.25–5.47 kbit/s (DR6 11 kbit/s) and many sub-bands carry a 1% duty cycle ([LoRaWAN Regional Parameters](https://lora-alliance.org/wp-content/uploads/2020/11/lorawan-regional-parameters-v1.1ra.pdf); [TTN airtime calculator](https://www.thethingsnetwork.org/airtime-calculator); [Semtech overview](https://www.semtech.com/lora/what-is-lora)). 1% of a day is 864 s of airtime, i.e. at most ≈27 KB/day at 250 bit/s and ≈590 KB/day at 5.47 kbit/s per transmitter, before protocol overhead and retries. Max LoRaWAN payloads are tens to a couple hundred bytes per frame. Other regions (e.g. US915) use different rules; check the regional parameters.
- What LoRa *can* do: carry small signed messages (an Ed25519 signature is 64 bytes) such as "transfer asset X to key Y, seq N", or a 32-byte commit hash for later anchoring. It cannot carry blocks of a busy chain or git bundles of real code. Use the network repo's USB/sneakernet bundle path for code; LoRa at most as an optional low-rate signal channel.

### D. Git-as-ledger (new option, evaluated seriously)
Idea: ownership and transfer records are signed git commits in a dedicated ledger repository, moved online or through the network repo's offline encrypted signed-bundle transfer.

**What already exists (and can be reused, not rewritten):**
- `network/tools/bundle-export.sh` / `bundle-verify-import.sh` (see `network/docs/SECURE-DATA-FLOW.md` §3): git bundle → gpg/age encryption to a full recipient fingerprint → signed `SHA256SUMS` → verified import requiring an exact `VALIDSIG` primary fingerprint, `fsckObjects`, atomic fetch into a quarantine namespace, no force, promotion by reviewed PR, and a provenance log with a same-name replay guard. Its own docs state the limit: no cryptographic replay protection (no nonce/sequence signed against receiver state).
- GitAI's `tools/gitai-offline.mjs` exports/imports bundles but they are **unsigned and unencrypted** (`threat_model.md`).
- `network/projects/pass/pass.mjs` prints a 32-bit djb2a "mark". It is a checksum anyone can recompute, **not a signature**, and must not be used for ownership.

**Design (proposal):**
1. *Keys.* Each agent/human registers a signing public key (SSH Ed25519 or OpenPGP) with the platform; keys are rotatable and revocable via signed commits in a `keys/` tree. Git natively signs commits and tags with GPG, and with SSH keys in Git ≥ 2.34 ([Git book: signing](https://git-scm.com/book/en/v2/Git-Tools-Signing-Your-Work)).
2. *Replace the pass mark.* `pass.mjs` emits the pass line plus an Ed25519 signature (Node's built-in `crypto.sign`) over the exact bytes; verification checks the signer against `keys/`. Keep djb2a only as a human-readable short id, labelled as such.
3. *Records.* `assets/<asset-id>.json` holds: content hash of the (encrypted) artifact, current owner key fingerprint, licence/assignment terms, and a monotonic `seq`. A transfer commit changes owner and increments `seq`; it must be signed by the current owner, and should carry the recipient's acceptance signature (multi-party: two signatures over the same canonical record, stored in the commit as trailers or a detached `.sig` file).
4. *Append-only refs.* The ledger branch only fast-forwards. A verifier (CI job + importer hook) replays history and rejects any commit whose signer is not authorised by the previous state, any `seq` that is not previous+1, or any rewrite. Server side: branch protection, no force-push, signed-commit requirement.
5. *Consensus / double-spend.* Signatures alone cannot stop an owner from signing two different transfers of the same asset while offline; git will show two divergent heads. Options, increasing decentralisation:
   - **Notary (Phase 2):** a transfer is final only after the platform's notary key countersigns the `(asset, seq)` pair; the notary signs at most one transfer per `(asset, seq)`. Simple, auditable, centralised.
   - **k-of-n federation (later):** several independent notaries (e.g. Collin + 2 trusted operators); final when k sign. Tolerates some notaries being offline or dishonest if k is chosen correctly (engineering judgement; needs a real protocol review).
   - **Public anchoring (Phase 3):** periodically publish the ledger head hash (or a Merkle root of new commits) to OpenTimestamps ([opentimestamps.org](https://opentimestamps.org/)) and/or in an Ergo box register or Solana memo. This proves *when* a state existed and makes rewriting history detectable; with a rule "first anchored transfer for `(asset, seq)` wins" it also orders conflicting offline spends after the fact. It does not prevent the conflict, and it requires a funded chain transaction for Ergo/Solana.
   - **Offline reality:** a recipient on the air-gapped side can verify signatures immediately but gets *finality* only when the notary/anchor is reached. Two conflicting transfers signed by the same key are themselves cryptographic proof of fraud → ban + dispute. Show "pending finality" in the UI.
6. *Hash strength.* Git's default object IDs are SHA-1 (with collision detection); a SHA-256 object format exists ([hash-function transition](https://git-scm.com/docs/hash-function-transition)). For ownership records, also put an explicit SHA-256 of each artifact inside the signed JSON so security does not rest on git's object hash.
7. *Fit with the network repo.* Ledger bundles go through the existing export/import scripts unchanged (they already require a full-fingerprint GPG signature). Add: a ledger verifier script run after quarantine import and before PR promotion; a signed `seq`/receiver-nonce to close the documented replay gap for the ledger lane; and the Ed25519 pass signature above. No rewrite of the transport is needed.

**Assessment:** strongest fit with Collin's offline/air-gapped and git-centric goals, cheapest to build on what exists, and lowest legal risk *as long as it records ownership of goods/IP and money moves in USD*. If ledger entries become transferable value units (credits, points that can be traded or cashed out), the money-transmission and securities questions in §3 apply to it too.

### E. Dollar-only launch, token later
Already the position of `docs/CURRENCY-DECISION.md`. Fastest to legal revenue, users understand it, processor handles card risk and much of KYC. Downside: no crypto-native hype. A token can be added later if there is real demand and counsel clears it.

## 2. What "real backing" could mean

| Backing | What it is | Honest assessment |
|---|---|---|
| **Compute / energy credits** ("backed by power") | 1 credit = a stated amount of GPU/CPU time or kWh-equivalent on GitAI-run hardware, redeemable only for compute | The most honest form of "backed by power": it is a prepaid service, backed only as long as we hold the capacity. Lowest risk if **closed-loop**: non-transferable between users, no cash-out, no promise of price rise. Making it tradeable or redeemable for cash pushes it toward money transmission (FinCEN guidance, [FIN-2019-G001](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models)) and, if marketed for profit, securities analysis. Counsel should also review prepaid-access rules. |
| **Stablecoin reserve** | A token redeemable 1:1 for dollars held in reserve | In the US the GENIUS Act (Pub. L. 119-27, July 18, 2025) limits payment-stablecoin issuance to permitted issuers with 1:1 reserves (cash, insured deposits, short-dated Treasuries), monthly reserve disclosure and AML duties ([congress.gov](https://www.congress.gov/bill/119th-congress/senate-bill/1582), [law text](https://www.govinfo.gov/content/pkg/PLAW-119publ27/pdf/PLAW-119publ27.pdf)). GitAI should **use** an existing regulated stablecoin through a provider, not issue one. |
| **Revenue share** | Holders receive part of the 8% fees | Holders expect profits from GitAI's efforts → very likely an investment contract under Howey ([SEC framework](https://www.sec.gov/corpfin/framework-investment-contract-analysis-digital-assets)). Avoid unless doing a registered or exempt offering. |
| **No backing (meme coin)** | Pure speculation | SEC staff view: generally not a security if truly just a meme, but no investor protection ([statement](https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins)). Reputational and litigation risk (see pump.fun above). Not "real human value". |

Real human value most credibly comes from the platform itself: people paying dollars for useful code, inventions and services. A token cannot create that value; at best it represents it.

## 3. Legal risks by option (US focus)

- **Securities (Howey).** Any token sold with an expectation of profit from GitAI's efforts (staking yield, fee share, "backed" price, roadmap promises) risks being an investment contract ([SEC framework](https://www.sec.gov/corpfin/framework-investment-contract-analysis-digital-assets)). Applies to A, B, C equally; to D only if ledger units are sold as investments.
- **NFTs for real money.** The SEC has treated NFT collections as securities when sold with profit promises: Impact Theory, ≈$6.1M settlement, Aug 2023 ([SEC](https://www.sec.gov/newsroom/press-releases/2023-163)); Stoner Cats, $1M penalty, Sep 2023 ([SEC](https://www.sec.gov/enforcement-litigation/distributions-harmed-investors/stoner-cats)). An NFT that is a receipt for a specific code licence, sold without investment marketing, is lower risk.
- **Money transmission (FinCEN / state).** Holding or moving other people's funds or convertible virtual currency between users can make GitAI a money transmitter ([FIN-2019-G001](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models)). Mitigation: licensed processor holds funds; GitAI never custodies keys or balances.
- **pump.fun specific.** Active securities class action against the launchpad (see §1A); no investor protection; rug-pull/bot sniping reputations attach to the project.
- **Stablecoins.** Issuing one without being a permitted issuer under the GENIUS Act is off the table.
- **Inventions and patents.** An AI cannot be a named inventor (*Thaler v. Vidal*, Fed. Cir. 2022, [opinion](https://www.cafc.uscourts.gov/opinions-orders/21-2347.OPINION.8-5-2022%5F1988142.pdf)); the USPTO's Nov 2025 revised guidance treats AI as a tool and only natural persons as inventors ([Federal Register](https://www.federalregister.gov/documents/2025/11/28/2025-21457/revised-inventorship-guidance-for-ai-assisted-inventions), [USPTO](https://www.uspto.gov/subscription-center/2025/revised-inventorship-guidance-ai-assisted-inventions)). Sales of "agent inventions" must name the human inventor/assignee.
- **IP transfer formalities.** A US copyright transfer needs a signed writing ([17 U.S.C. §204](https://www.law.cornell.edu/uscode/text/17/204)); patent assignments are in writing and should be recorded with the USPTO ([35 U.S.C. §261](https://www.law.cornell.edu/uscode/text/35/261)). An NFT or ledger entry alone does not transfer IP; pair it with a signed assignment/licence (which the git-as-ledger record can carry and sign).
- **Sanctions / tax.** Any crypto payout path needs OFAC screening and tax reporting (see sources in `docs/CURRENCY-DECISION.md`).

## 4. Encrypted git-NFT files (transferable ownership of code/inventions)

Proposal (works with option D, optionally mirrored as an Ergo EIP-4/EIP-24 or Solana/Metaplex NFT later):
1. The artifact (repo bundle, design files) is encrypted with a random content key; the ciphertext's SHA-256 goes in the asset record.
2. The content key is wrapped (age or OpenPGP) to the current owner's public key and stored next to the record.
3. Transfer = owner-signed + recipient-accepted ledger commit, re-wrap the content key to the new owner, notary countersign; the signed record references the signed IP assignment/licence text.
4. Payment for the transfer goes through the USD processor with the 4% + 4% fee; the ledger commit references the payment id. No on-chain money required.

Honest limits: a previous owner who decrypted the file still knows its contents; encryption cannot revoke knowledge, so value rests on the legal assignment, licence terms and provenance, not on secrecy alone. Plaintext metadata in bundles (fingerprints, times, sizes; see the network repo's table) is visible to anyone handling the medium unless redacted.

## 5. Phased path

| Phase | Do | Gate to next phase |
|---|---|---|
| 1. Dollar launch | Licensed processor, USD 4% + 4%, no token; remove meme-coin stake from UI/docs; production gate stays closed until storage + owner are set | Processor live, ToS/privacy reviewed |
| 2. Git-as-ledger | Ed25519/SSH/GPG signatures everywhere (replace djb2a mark), `keys/` tree, signed append-only asset ledger, notary countersign, ledger verifier on import, signed seq/nonce for replay | Verifier tests + external security review |
| 3. Public anchoring | OpenTimestamps of ledger heads; optional Ergo/Solana hash anchor transactions (no token) | Anchoring tested on testnet/mainnet with small fees |
| 4. Token research only | Closed-loop compute credits first; Ergo (or Solana) **testnet** token prototype; written legal opinion | Counsel approves structure; no revenue share; no pump.fun |
| Not planned | Own blockchain, LoRa-carried chain, own stablecoin, revenue-share token | — |
