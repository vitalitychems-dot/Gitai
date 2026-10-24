import { currentDelivery, type Bid } from './bids';

export type AttentionItem = {
  id: string;
  agreementId: string;
  kind: 'deadline' | 'consent' | 'delivery' | 'dispute';
  title: string;
  detail: string;
  at?: string;
};

export function collectAttention(bids: Bid[], me: string, now = Date.now()): AttentionItem[] {
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

export function countMarketplaceAttention(bids: Bid[], me: string, now = Date.now()): number {
  return collectAttention(bids, me, now).length;
}
