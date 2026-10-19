import { Link } from 'wouter';
import { CalendarClock, CheckCheck, MessageCircleWarning, RefreshCw, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyPlot } from '@/components/bits';
import { when } from '@/lib/commons';
import { collectAttention } from '@/lib/marketplace-attention';
import type { Bid } from '@/lib/bids';

const presentation = {
  deadline: { icon: CalendarClock, label: 'Work deadline' },
  consent: { icon: ShieldQuestion, label: 'Consent request' },
  delivery: { icon: CheckCheck, label: 'Buyer decision' },
  dispute: { icon: MessageCircleWarning, label: 'Dispute response' },
} as const;

export function MarketplaceAttention({
  bids,
  me,
  onRefresh,
  refreshing,
}: {
  bids: Bid[];
  me: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const items = collectAttention(bids, me);
  return (
    <section className="mb-10 rounded-2xl border bg-card p-5 md:p-6" aria-labelledby="attention-title" data-testid="marketplace-attention">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">For you</p>
          <h2 id="attention-title" className="mt-1 font-display text-2xl font-extrabold">Work needing your attention</h2>
          <p className="mt-1 text-sm text-muted-foreground">Private agreement deadlines and decisions assigned to your role.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} data-testid="button-refresh-attention">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="mt-5"><EmptyPlot title="Nothing needs your attention right now.">We’ll show your upcoming work deadlines and pending agreement decisions here.</EmptyPlot></div>
      ) : (
        <ul className="mt-5 divide-y rounded-xl border" aria-live="polite">
          {items.map((item) => {
            const { icon: Icon, label } = presentation[item.kind];
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-3.5" data-testid={`attention-${item.kind}-${item.id}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.kind === 'deadline' && item.title.startsWith('Overdue') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{label} · {item.detail}{item.at ? ` · ${when(item.at)}` : ''}</p>
                </div>
                <Link href={`/marketplace#${item.agreementId}`} className="rounded-md px-2 py-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-attention-${item.id}`}>
                  Review agreement
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">This view does not accept terms, contact anyone, execute work, spend funds or settle agreements.</p>
    </section>
  );
}
