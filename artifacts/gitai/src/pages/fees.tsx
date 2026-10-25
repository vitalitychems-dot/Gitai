import { useState } from 'react';
import { useQuoteFees } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Field, PageHead, fieldClass } from '@/components/bits';
import { errMsg, money, toMinor } from '@/lib/commons';

export default function Fees() {
  const quote = useQuoteFees();
  const [sub, setSub] = useState('100.00');
  const [ref, setRef] = useState('');
  const subMinor = toMinor(sub);
  const refMinor = ref.trim() ? toMinor(ref) : 0;
  const ok = subMinor !== null && subMinor >= 1 && subMinor <= 100000000 && refMinor !== null && refMinor >= 0;
  const d = quote.data;
  const c = d?.currency ?? 'USD';
  const rows: [string, number, boolean?][] = d ? [
    ['Subtotal', d.subtotalMinor], ['Buyer fee', d.buyerFeeMinor], ['Buyer pays', d.buyerTotalMinor, true],
    ['Seller fee', d.sellerFeeMinor], ['Seller receives', d.sellerNetMinor, true], ['Platform gross', d.platformGrossMinor],
  ] : [];
  return (
    <>
      <PageHead eyebrow="Fee quotes" title="See the split before you agree." lede={<>A tested calculator: 4% from the buyer and 4% from the seller. It is a quote, <strong className="text-foreground">not a payment</strong>. Escrow fee policy is pending.</>} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <form className="h-fit space-y-4 rounded-2xl border bg-card p-5" onSubmit={(e) => { e.preventDefault(); if (ok && subMinor !== null) quote.mutate({ data: { subtotalMinor: subMinor, ...(refMinor ? { refundMinor: refMinor } : {}) } }); }}>
          <Field label="Subtotal (USD)" htmlFor="f-sub"><input id="f-sub" inputMode="decimal" className={`${fieldClass} font-mono text-lg`} value={sub} onChange={(e) => setSub(e.target.value)} data-testid="input-fee-subtotal" /></Field>
          <Field label="Refund (optional)" htmlFor="f-ref" hint="Shows how a partial refund would unwind."><input id="f-ref" inputMode="decimal" className={`${fieldClass} font-mono`} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="input-fee-refund" /></Field>
          <Button type="submit" className="w-full" disabled={!ok || quote.isPending} data-testid="button-quote">{quote.isPending ? 'Calculating' : 'Get quote'}</Button>
          {quote.isError && <p role="alert" className="text-sm text-destructive">{errMsg(quote.error)}</p>}
        </form>
        <div className="ledger-lines min-h-64 rounded-2xl border bg-card p-5" aria-live="polite">
          {!d ? <p className="pt-1 text-sm leading-8 text-muted-foreground">Enter a subtotal and request a quote. The server computes it; nothing is charged.</p> : (
            <>
              <dl>
                {rows.map(([k, v, strong]) => (
                  <div key={k} className="flex h-8 items-end justify-between">
                    <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>{k}</dt>
                    <dd className={`font-mono ${strong ? 'text-lg font-semibold text-primary' : ''}`} data-testid={`text-fee-${k.toLowerCase().replace(/\s/g, '-')}`}>{money(v, c)}</dd>
                  </div>
                ))}
              </dl>
              {(d.refundBuyerMinor > 0 || d.refundSellerMinor > 0 || d.refundPlatformMinor > 0) && (
                <dl className="mt-8">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-accent-foreground">Refund unwind</p>
                  {([['To buyer', d.refundBuyerMinor], ['From seller', d.refundSellerMinor], ['From platform', d.refundPlatformMinor]] as const).map(([k, v]) => (
                    <div key={k} className="flex h-8 items-end justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{money(v, c)}</dd></div>
                  ))}
                </dl>
              )}
              <p className="mt-6 font-mono text-[11px] text-muted-foreground">quote {d.id} · policy {d.version} · settlement: {d.settlement}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
