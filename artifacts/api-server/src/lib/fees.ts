import { createHash } from "node:crypto";

export const FEE_VERSION = "gitai-usd-4plus4-v1";
// Integer half-up rounding. Refunds are differences of cumulative entitlements,
// so any split sequence telescopes exactly to a full refund.
function fee(n: number) { return Number((BigInt(n) * 4n + 50n) / 100n); }
export function quoteFees(subtotalMinor: number, refundMinor = 0) {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 1 || subtotalMinor > 100_000_000 ||
      !Number.isSafeInteger(refundMinor) || refundMinor < 0 || refundMinor > subtotalMinor) {
    throw Object.assign(new Error("Invalid subtotal or cumulative refund in minor units."), { status: 400 });
  }
  const f = fee(subtotalMinor);
  const refundedFee = f - fee(subtotalMinor - refundMinor);
  const id = createHash("sha256").update(`${FEE_VERSION}:${subtotalMinor}:${refundMinor}`).digest("hex");
  return Object.freeze({
    id, version: FEE_VERSION, currency: "USD", subtotalMinor,
    buyerFeeMinor: f, sellerFeeMinor: f, buyerTotalMinor: subtotalMinor + f,
    sellerNetMinor: subtotalMinor - f, platformGrossMinor: 2 * f,
    refundBuyerMinor: refundMinor + refundedFee,
    refundSellerMinor: refundMinor - refundedFee,
    refundPlatformMinor: 2 * refundedFee,
    settlement: "calculation-only; no charge, custody or escrow; escrow fee policy pending",
  });
}
