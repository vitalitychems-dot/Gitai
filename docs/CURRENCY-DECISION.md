# Currency / settlement decision

**Recommendation:** deliver useful code/community/services and verified
conventional payments first. Do not create a GitAI meme token, blockchain or
custodial exchange for this MVP. Minting a token does not create revenue,
liquidity, redemption backing or spendable real-world purchasing power.

This is engineering risk analysis, not legal/investment advice. Legal obligations
depend on jurisdictions, exact control of funds and actual provider contracts.
No legal/provider prerequisites have been verified for GitAI.

| Question | Conventional hosted marketplace settlement | Audited established-chain / noncustodial option | New chain or GitAI token / exchange |
|---|---|---|---|
| Liquidity / redemption | Existing fiat rails; provider settlement/chargeback risk remains | Market liquidity varies; stablecoin redemption relies on issuer/eligibility/reserves; tokens can depeg | Must bootstrap both demand and executable liquidity; no automatic par redemption; a meme token can become worthless |
| Consensus / Sybil | Provider-authoritative ledger plus accountable verified operators; fake accounts still need controls | Inherit chosen network consensus, not absolute safety; confirmations/reorg/finality and RPC trust must be specified | Must fund validator security, prevent Sybil capture, design incentives and recovery from partitions/attacks; a small new network is easier to capture |
| Keys / recovery | Provider-hosted onboarding/account recovery; GitAI must not collect bank/ID documents | User-managed standard wallet keys or reviewed recovery; lost keys may be unrecoverable; phishing and malicious approvals matter | Adds validator/admin/bridge/treasury keys, incident response and concentration risks; no homegrown crypto or key-generation feature is authorized |
| Security audit | Auth, webhook signatures, idempotency, immutable quotes, ledger reconciliation | All prior controls plus wallet/transaction intent, chain/network IDs, replay protection, contract audits and dependency verification | All prior controls plus consensus/client/token/bridge/exchange audits, upgrade governance and economic attack review |
| Licensing / tax / sanctions | Marketplace payments, consumer protection and operator verification; licensed provider does not waive platform obligations | “Noncustodial” is not a blanket legal exemption. Money-transmission/securities/AML/sanctions/tax treatment needs jurisdiction review | Issuance, exchange, custody and promotional claims substantially expand legal/compliance risk; tax events can arise without fiat cash-out |
| Exchange/custody | Don't hold funds; use accountable licensed partners where required | Avoid GitAI custody; off/on ramps still introduce insolvency, freezes and withdrawal risk | Order matching, market manipulation, reserves, key theft, insolvency, custody and redemption obligations; not simply another CRUD module |
| Offline finality | Offline request is pending; provider confirmation requires connectivity | An offline signature can later be rejected/conflict; a disconnected replica cannot prove global finality or prevent all double-spending | A new chain does not solve partitioned double spending; “offline balances” require risk limits/trusted devices/reconciliation and still have tradeoffs |
| Operations / cost | Processor fees, disputes/refunds, KYC workflows, support/reconciliation | Gas/RPC/indexing, contract monitoring, audits, wallet support and exchange-rate volatility | Continuous validators/RPC/explorers, security/economic audits, liquidity/market-making, governance, compliance and incident response; highest total burden |

## Fee policy that remains binding

Version `gitai-usd-4plus4-v1`: 4% buyer + 4% seller on agreed service subtotal.
$100 -> buyer $104, seller $96, gross platform $8 before processor costs, tax,
refunds and disputes. Calculations use integer cents with half-up fee rounding.
Cumulative partial refunds use the difference between original and remaining
fee entitlements so splitting a refund cannot accumulate rounding profit.

Quotes are immutable deterministic calculations, not authorization, ledger
entries, settlement evidence, escrow or promises of income. No provider is
connected. “4% ecstatic” is ambiguous: **escrow fee policy pending owner decision**;
there is no third fee, staking deduction or token purchase. A delayed payout must
not be called escrow without an appropriate licensed/provider arrangement.

## Sources consulted

These are primary engineering/regulatory references, not a complete legal review.
Each page below was actually fetched during this build:

1. [BIS Project Polaris handbook](https://www.bis.org/publ/othp64.htm),
   11 May 2023. Offline payment design has substantial technology, security,
   privacy and operational tradeoffs; no one-size-fits-all solution.
2. [Ethereum proof-of-stake documentation](https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/).
   Validators stake capital, check blocks and face slashing; network security
   requires actual consensus infrastructure, not merely a token contract.
3. [FinCEN FIN-2019-G001](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models),
   9 May 2019. Applicability to business models involving convertible virtual
   currencies must be evaluated, especially administrator/exchanger activity.
4. [IRS digital assets](https://www.irs.gov/filing/digital-assets).
   US digital assets are generally property for federal tax purposes and
   transactions/income can create reporting obligations.
5. [OFAC virtual-currency compliance guidance announcement](https://ofac.treasury.gov/recent-actions/20211015),
   15 October 2021. Sanctions compliance requirements and enforcement apply;
   virtual currency is not an exception.

A research/testnet proposal may be reviewed later. Nothing here authorizes
mainnet minting, token sales, custody, exchange, banking account creation,
private-key generation/disclosure, or real charges/payouts.
