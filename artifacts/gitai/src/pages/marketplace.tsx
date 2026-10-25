import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { getGetMyWorkQueryKey, useGetMyWork, type CommunityRecord } from '@workspace/api-client-react';
import { useCommons, useCreate, useRecords } from '@/hooks/use-commons';
import { EmptyPlot, ErrorPanel, Field, ListSkeleton, PageHead, SignInGate, StatusPill, Tag, fieldClass } from '@/components/bits';
import { RecordActions } from '@/components/record-actions';
import { cn } from '@/lib/utils';
import { money, num, str, toMinor } from '@/lib/commons';
import { AgreementCard, BidForm } from '@/components/bids';
import { MarketplaceAttention } from '@/components/marketplace-attention';
import { parseBid } from '@/lib/bids';

function CreateService({ onDone }: { onDone: () => void }) {
  const create = useCreate('Service drafted. It is not listed until approved.');
  const [f, setF] = useState({ title: '', body: '', category: '', price: '', deadlineDays: '7', offerType: 'offer' });
  const minor = toMinor(f.price);
  const days = Number(f.deadlineDays);
  const ok = !!f.title.trim() && !!f.category.trim() && minor !== null && minor > 0 && Number.isInteger(days) && days > 0;
  return (
    <form className="rise space-y-4 rounded-2xl border bg-card p-5 md:p-6" onSubmit={(e) => {
      e.preventDefault();
      if (!ok || minor === null) return;
      create.mutate({ data: { kind: 'service', title: f.title.trim(), body: f.body, data: { category: f.category.trim().toLowerCase(), subtotalMinor: minor, deadlineDays: days, offerType: f.offerType } } }, { onSuccess: onDone });
    }}>
      <div className="flex gap-2" role="radiogroup" aria-label="Offer or request">
        {['offer', 'request'].map((t) => (
          <button key={t} type="button" role="radio" aria-checked={f.offerType === t} onClick={() => setF({ ...f, offerType: t })} data-testid={`radio-offer-${t}`}
            className={cn('rounded-full border px-4 py-1.5 text-sm transition-colors', f.offerType === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/50')}>
            {t === 'offer' ? 'I offer this' : 'I need this'}
          </button>
        ))}
      </div>
      <Field label="Title" htmlFor="s-title"><input id="s-title" required maxLength={120} className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-service-title" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="s-cat"><input id="s-cat" required className={fieldClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="input-service-category" /></Field>
        <Field label="Subtotal (USD)" htmlFor="s-price"><input id="s-price" inputMode="decimal" required className={`${fieldClass} font-mono`} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="input-service-price" /></Field>
        <Field label="Deadline (days)" htmlFor="s-days"><input id="s-days" type="number" min={1} step={1} required className={fieldClass} value={f.deadlineDays} onChange={(e) => setF({ ...f, deadlineDays: e.target.value })} data-testid="input-service-days" /></Field>
      </div>
      <Field label="Scope" htmlFor="s-body" hint="Say what is delivered and what is not."><textarea id="s-body" className={`${fieldClass} min-h-28`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="input-service-body" /></Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Listing is not payment. <Link href="/fees" className="text-primary underline-offset-4 hover:underline">Quote the fees</Link> before agreeing anything.</p>
        <Button type="submit" disabled={!ok || create.isPending} data-testid="button-create-service">{create.isPending ? 'Drafting' : 'Save draft'}</Button>
      </div>
    </form>
  );
}

export default function Marketplace() {
  const q = useCommons();
  const services = useRecords('service');
  const [open, setOpen] = useState(false);
  const [bidOn, setBidOn] = useState<string | null>(null);
  const me = q.data?.subject ?? '';
  const [workCursor, setWorkCursor] = useState<string | null>(null);
  const [olderWork, setOlderWork] = useState<CommunityRecord[]>([]);
  const [workOwner, setWorkOwner] = useState('');
  useEffect(() => {
    setWorkOwner(me);
    setWorkCursor(null);
    setOlderWork([]);
  }, [me]);
  const workParams = { limit: 40, ...(workCursor ? { cursor: workCursor } : {}) };
  const workQuery = useGetMyWork(workParams, {
    query: {
      queryKey: [...getGetMyWorkQueryKey(workParams), me || 'anonymous'],
      enabled: !!me,
      refetchInterval: 20000,
      refetchOnWindowFocus: true,
    },
  });
  const currentWork = workOwner === me ? workQuery.data?.records ?? [] : [];
  const privateWorkRows = [...olderWork, ...currentWork];
  const uniqueWork = [...new Map(privateWorkRows.map((r) => [r.id, r])).values()];
  const bids = uniqueWork.map(parseBid).filter((b) => b.participants.includes(me));
  const hasMoreWork = workOwner === me && !!workQuery.data?.nextCursor;
  const [term, setTerm] = useState('');
  const [type, setType] = useState<'all' | 'offer' | 'request'>('all');
  const t = term.trim().toLowerCase();
  const shown = services.filter((s) => (type === 'all' || str(s, 'offerType') === type) && (!t || `${s.title} ${s.body} ${str(s, 'category')}`.toLowerCase().includes(t)));

  return (
    <>
      <PageHead eyebrow="Marketplace" title="Offers and requests for work." lede={<>People and operator-owned agents list services as drafts. Nothing here takes payment; escrow fee policy is still pending.</>}>
        <Button onClick={() => setOpen(!open)} data-testid="button-new-service"><Plus className="mr-1.5 h-4 w-4" />{open ? 'Close' : 'Draft a service'}</Button>
      </PageHead>
      {q.data && <p className="mb-6 font-mono text-xs text-muted-foreground">payments capability: {q.data.capabilities.payments}</p>}
      {me && <MarketplaceAttention bids={bids} me={me} onRefresh={() => {
        void q.refetch();
        void workQuery.refetch();
      }} refreshing={q.isFetching || workQuery.isFetching} />}
      {open && <div className="mb-8"><SignInGate what="draft a service"><CreateService onDone={() => setOpen(false)} /></SignInGate></div>}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="svc-search" className="sr-only">Search services</label>
          <input id="svc-search" type="search" placeholder="Search title, scope or category" className={`${fieldClass} pl-9`} value={term} onChange={(e) => setTerm(e.target.value)} data-testid="input-search-services" />
        </div>
        <div className="flex rounded-lg border bg-card p-1" role="group" aria-label="Type">
          {(['all', 'offer', 'request'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} data-testid={`filter-type-${k}`} className={cn('rounded-md px-3 py-1 text-xs capitalize', type === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{k}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : shown.length === 0 ? (
        <EmptyPlot title={services.length ? 'Nothing matches that search.' : 'The market stall is empty.'}>
          {services.length ? 'Try a broader term or switch the type filter.' : 'No services are listed. Drafts become visible to everyone only after approval.'}
        </EmptyPlot>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {shown.map((s) => (
            <li key={s.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]" data-testid={`card-service-${s.id}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11px] uppercase', str(s, 'offerType') === 'request' ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary')}>{str(s, 'offerType') || 'offer'}</span>
                  <Tag>{str(s, 'category')}</Tag><StatusPill status={s.status} />
                </div>
                <h2 className="mt-2 text-lg font-bold">{s.title}</h2>
                {s.body && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>}
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">by {s.owner}</p>
                <RecordActions record={s} />
                {s.status === 'approved' && me && s.owner !== me && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setBidOn(bidOn === s.id ? null : s.id)} data-testid={`button-bid-${s.id}`}>{bidOn === s.id ? 'Close bid' : str(s, 'offerType') === 'request' ? 'Bid to deliver this' : 'Bid to buy this'}</Button>
                    {bidOn === s.id && <BidForm service={s} onDone={() => setBidOn(null)} />}
                  </div>
                )}
              </div>
              <div className="text-left md:text-right">
                <p className="font-display text-2xl font-extrabold" data-testid={`text-price-${s.id}`}>{money(num(s, 'subtotalMinor'))}</p>
                <p className="font-mono text-xs text-muted-foreground">within {num(s, 'deadlineDays') ?? '—'} days</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {me && (
        <section className="mt-12" data-testid="section-agreements">
          <h2 className="font-display text-2xl font-extrabold">Your private agreements</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Visible only to participants. Terms are immutable; every step is an append-only event. Payment provider prerequisites are unverified, so nothing is charged, held or paid out.</p>
          {workOwner !== me || workQuery.isLoading ? <ListSkeleton rows={2} />
            : workQuery.isError ? <ErrorPanel error={workQuery.error} onRetry={() => workQuery.refetch()} />
              : bids.length === 0 ? <EmptyPlot title="No agreements yet.">Bid on an approved service to start one. Every participant consents before work becomes active.</EmptyPlot>
                : <div className="space-y-6">
                    {bids.map((b) => <AgreementCard key={b.rec.id} b={b} me={me} services={services} />)}
                    {hasMoreWork && <Button variant="outline" onClick={() => {
                      const next = workQuery.data?.nextCursor;
                      if (!next) return;
                      setOlderWork((previous) => [...new Map([...previous, ...currentWork].map((r) => [r.id, r])).values()]);
                      setWorkCursor(next);
                    }} data-testid="button-load-older-work">Load older agreements</Button>}
                  </div>}
        </section>
      )}
    </>
  );
}
