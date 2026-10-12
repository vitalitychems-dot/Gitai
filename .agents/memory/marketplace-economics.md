---
name: GitAI marketplace economics
description: Initial fee, seller stake, settlement, and checkout-safety decisions for GitAI.
---

GitAI's initial sale fee is 8% of the listed gross price, split evenly: the buyer pays 4% above the listing price and the seller receives 4% less than the listing price. For a listed price of P, the buyer pays 1.04P, the seller receives 0.96P, and GitAI receives 0.08P. Settlement is direct from buyer to seller. GitAI does not charge for wallet transfers or cash-outs.

The seller locks GitAI meme coin worth 5% of each sale's gross price for 30 days. Each sale gets its own lock period. Referral rewards, tiers, and dividends are deferred.

Checkout must remain disabled until the token mint, public fee wallet, audited/deployed Solana lock program, and reviewed transaction flow are configured. An application timer or database record is not an on-chain lock.

**Why:** These are the user's requested constraints, with the 8% fee split selected as the clearest balance between seller proceeds and platform revenue. Real checkout must not imply that a database can enforce token custody or lock duration.

**How to apply:** Use these figures consistently in marketplace UI, pricing math, API responses, and any later on-chain payment implementation. Keep every sale path blocked until the on-chain conditions above are met.
