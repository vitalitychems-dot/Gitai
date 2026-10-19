import { Link } from 'wouter';
import { CalendarClock, CheckCheck, MessageCircleWarning, RefreshCw, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyPlot } from '@/components/bits';
import { when } from '@/lib/commons';
import { currentDelivery, type Bid } from '@/lib/bids';

type AttentionItem = {
  id: string;
  agreementId: string;
  kind: 'deadline' | 'consent' | 'delivery' | 'dispute';
  title: string;
  detail: string;
  at?: string;
};

function collectAttention(bids: Bid[], me: string): AttentionItem[] {
  const now = Date.now();
  const items: AttentionItem[] = [];

  for (const bid of bids) {
    if (!bid.participants.includes(me)) continue;
    const agreementId = `agreement-${bid.rec.id}`;
    const label = bid.rec.title || 'Private agreement';

    if (
      bid.rec.status === 'proposed' &&
      !bid.consents[me] &&
      Date.parse(bid.deadline) > now &&
      bid.milestones.every((milestone) => Date.parse(milestone.dueAt) > now)
    ) {
      items.push({
        id: `${bid.rec.id}-consent`,
        agreementId,
        kind: 'consent',
        title: 'Your consent is requested',
        detail: label,
        at: bid.rec.createdAt,
      });
    }

    if (bid.rec.status === 'active' && me === bid.seller) {
      bid.milestones.forEach((milestone, index) => {
        if (!['pending', 'rejected'].includes(milestone.status) || currentDelivery(bid, index)) return;
        items.push({
          id: `${bid.rec.id}-deadline-${index}`,
          agreementId,
          kind: 'deadline',
          title: `${Date.parse(milestone.dueAt) < now ? 'Overdue' : 'Upcoming'}: ${milestone.title}`,
          detail: `${label} · milestone ${index + 1}`,
          at: milestone.dueAt,
        });
      });
    }

    if (bid.rec.status === 'active' && me === bid.buyer) {
      bid.milestones.forEach((milestone, index) => {
        const delivery = currentDelivery(bid, index);
        if (!delivery) return;
        items.push({
          id: `${bid.rec.id}-delivery-${index}`,
          agreementId,
          kind: 'delivery',
          title: `Delivery awaits your decision: ${milestone.title}`,
          detail: `${label} · milestone ${index + 1}`,
          at: delivery.at,
        });
      });
    }

    if (bid.rec.status === 'disputed') {
      const latest = bid.events.at(-1);
      const outstandingResolution =
        bid.resolution &&
        bid.resolution.actor !== me &&
        !bid.resolutionAgreements.includes(me);
      if (outstandingResolution || (latest && latest.actor !== me)) {
        items.push({
          id: `${bid.rec.id}-dispute`,
          agreementId,
          kind: 'dispute',
          title: outstandingResolution ? 'A resolution awaits your response' : 'Disputed work awaits your response',
          detail: label,
          at: latest?.at,
        });
      }
    }
  }

  return items.sort((a, b) => {
    const rank = (item: AttentionItem) => {
      if (item.kind === 'deadline') return item.at && Date.parse(item.at) < now ? 0 : 4;
      if (item.kind === 'delivery') return 1;
      if (item.kind === 'dispute') return 2;
      return 3;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff) return rankDiff;
    return (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0);
  });
}

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
