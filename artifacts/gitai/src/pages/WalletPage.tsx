import { useEffect, useState } from "react";
import { ArrowUpRight, CircleAlert, CircleCheck, Copy, ExternalLink, LockKeyhole, WalletCards } from "lucide-react";
import { useSolanaWallet } from "../lib/solana-wallet";

type PaymentStatus = {
  fees: { buyerPercent: number; sellerPercent: number; totalPercent: number };
  sellerStake: { percentOfGrossSale: number; token: string; lockDays: number };
  settlement: "direct";
  feesOnTransfersOrCashOuts: boolean;
  configured: { feeWallet: boolean; tokenMint: boolean; stakingProgram: boolean };
  checkoutEnabled: boolean;
  blockers: string[];
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const statusUrl = `${basePath}/api/gitai/payments/status`;

export default function WalletPage() {
  const wallet = useSolanaWallet();
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [amount, setAmount] = useState("1");
  const [copied, setCopied] = useState(false);
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(statusUrl, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load payment readiness.");
        return (await response.json()) as PaymentStatus;
      })
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((error: unknown) => {
        if (active) setStatusError(error instanceof Error ? error.message : "Could not load payment readiness.");
      });
    return () => {
      active = false;
    };
  }, []);

  const price = Number(amount);
  const validAmount = Number.isFinite(price) && price > 0;
  const fmt = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL`;

  const connect = async () => {
    setWalletError("");
    try {
      await wallet.connect();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect Phantom.");
    }
  };

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setWalletError("Clipboard access was blocked. You can still select and copy the address.");
    }
  };

  return (
    <div className="page-enter">
      <div className="mb-7">
        <div className="mb-2 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
          <span className="h-px w-5 bg-primary" /> Wallet and settlement
        </div>
        <h1 className="font-display text-[32px] font-semibold leading-[1.08] tracking-[-.045em] sm:text-[40px]">
          Money, with the rules visible.
        </h1>
        <p className="mt-2 max-w-[660px] text-[13px] leading-6 text-muted-foreground">
          Connect your own Phantom wallet. GitAI never asks for a seed phrase or private key and does not custody funds.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div className="rounded-[22px] border border-border bg-card p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards size={19} /></span>
                <div>
                  <h2 className="font-display text-[18px] font-semibold">Solana wallet</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Wallet extension connection; GitAI cannot move funds without your approval.</p>
                </div>
              </div>
              {wallet.address ? (
                <button type="button" onClick={() => void wallet.disconnect()} className="rounded-xl border border-border px-3 py-2 text-[11px] font-bold hover:bg-secondary" data-testid="button-wallet-disconnect">
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={() => void connect()} disabled={wallet.connecting || !wallet.available} className="rounded-xl bg-primary px-4 py-2.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-wallet-connect">
                  {wallet.connecting ? "Connecting…" : wallet.available ? "Connect Phantom" : "Phantom not detected"}
                </button>
              )}
            </div>

            {wallet.address && (
              <div className="mt-5 rounded-xl border border-border bg-secondary/45 p-4">
                <div className="mb-1 font-mono-ui text-[9px] uppercase tracking-[.15em] text-muted-foreground">Connected public address</div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-[11px]">{wallet.address}</code>
                  <button type="button" aria-label="Copy wallet address" onClick={() => void copyAddress()} className="shrink-0 rounded-lg border border-border p-2 hover:bg-background" data-testid="button-copy-wallet">
                    <Copy size={14} />
                  </button>
                </div>
                {copied && <p className="mt-2 text-[10px] text-primary">Copied.</p>}
              </div>
            )}
            {walletError && <p role="alert" className="mt-3 text-[11px] text-destructive">{walletError}</p>}
            {!wallet.available && (
              <a href="https://phantom.app/download" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline">
                Get Phantom <ExternalLink size={12} />
              </a>
            )}
            <p className="mt-4 text-[10px] leading-5 text-muted-foreground">
              GitAI connects to Phantom in this browser. Wallet sign-in on mobile and other wallet providers are not enabled yet.
            </p>
          </div>

          <div className="rounded-[22px] border border-border bg-card p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono-ui text-[9px] uppercase tracking-[.15em] text-primary">Transparent price math</div>
                <h2 className="mt-1 font-display text-[18px] font-semibold">8% total marketplace fee</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-mono-ui text-[10px] text-primary">4% + 4%</span>
            </div>
            <label className="block max-w-[260px]">
              <span className="mb-1.5 block text-[10px] font-bold text-muted-foreground">Example sale price (SOL)</span>
              <input className="field h-[42px] text-[13px]" type="number" min="0.000000001" step="0.000000001" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="input-payment-example" />
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-secondary/55 p-3"><div className="text-[9px] text-muted-foreground">Buyer total</div><div className="mt-1 font-display text-[15px] font-semibold">{validAmount ? fmt(price * 1.04) : "—"}</div><div className="mt-1 text-[9px] text-muted-foreground">Listed price + 4%</div></div>
              <div className="rounded-xl bg-secondary/55 p-3"><div className="text-[9px] text-muted-foreground">Seller receives</div><div className="mt-1 font-display text-[15px] font-semibold">{validAmount ? fmt(price * 0.96) : "—"}</div><div className="mt-1 text-[9px] text-muted-foreground">Listed price − 4%</div></div>
              <div className="rounded-xl bg-secondary/55 p-3"><div className="text-[9px] text-muted-foreground">GitAI sale fee</div><div className="mt-1 font-display text-[15px] font-semibold">{validAmount ? fmt(price * 0.08) : "—"}</div><div className="mt-1 text-[9px] text-muted-foreground">4% buyer + 4% seller</div></div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
              The seller portion is deducted from sale proceeds. Direct wallet transfers and cash-outs have no GitAI fee.
            </p>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-[22px] border border-accent/25 bg-accent/5 p-5">
            <div className="flex items-center gap-2 text-[12px] font-bold text-accent"><CircleAlert size={16} /> Live checkout is not ready</div>
            <p className="mt-2 text-[11px] leading-5 text-foreground/75">
              Payments are disabled until the platform wallet, meme-coin mint, and enforceable 30-day seller lock are configured. No purchase can bypass those checks.
            </p>
          </div>

          <div className="rounded-[22px] border border-border bg-card p-5">
            <h2 className="font-display text-[16px] font-semibold">Launch checklist</h2>
            {statusError ? (
              <p role="alert" className="mt-3 text-[11px] text-destructive">{statusError}</p>
            ) : status ? (
              <div className="mt-4 space-y-3">
                {[
                  ["Public fee wallet", status.configured.feeWallet],
                  ["Meme-coin mint", status.configured.tokenMint],
                  ["On-chain 30-day lock program", status.configured.stakingProgram],
                  ["Audited checkout transaction path", status.checkoutEnabled],
                ].map(([label, ready]) => (
                  <div key={String(label)} className="flex items-start gap-2 text-[11px]">
                    {ready ? <CircleCheck size={14} className="mt-0.5 text-primary" /> : <CircleAlert size={14} className="mt-0.5 text-accent" />}
                    <span className={ready ? "text-foreground" : "text-muted-foreground"}>{String(label)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-3 text-[10px] leading-5 text-muted-foreground">
                  Seller stake: {status.sellerStake.percentOfGrossSale}% of gross sale value in {status.sellerStake.token}, locked for {status.sellerStake.lockDays} days per sale.
                </div>
              </div>
            ) : (
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-secondary" aria-label="Loading payment readiness" />
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/55 p-3 text-[10px] leading-5 text-muted-foreground">
              <LockKeyhole size={14} className="mt-0.5 shrink-0" />
              A timer in the app is not a token lock. The lock must be enforced by a deployed, reviewed Solana program.
            </div>
          </div>

          <a href="https://jup.ag" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[18px] border border-border bg-card p-4 text-[11px] font-bold transition-colors hover:border-primary/40" data-testid="link-jupiter-swap">
            <span><span className="block">Need SOL?</span><span className="mt-1 block font-normal text-muted-foreground">Swap supported assets in Jupiter, then return to GitAI.</span></span>
            <ArrowUpRight size={16} className="text-primary" />
          </a>
        </aside>
      </div>
    </div>
  );
}
