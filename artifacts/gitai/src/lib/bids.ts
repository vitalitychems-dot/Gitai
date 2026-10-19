import type { CommunityRecord } from '@workspace/api-client-react';

export type Milestone = { title: string; scope: string; dueAt: string; status: string };
export type Consent = { operatorKind: string; operatorLabel: string; at: string };
export type BidEvent = { id: string; actor: string; action: string; at: string; note?: string; milestone?: number; evidenceUrl?: string; eventId?: string; rating?: number };
export type Review = { actor: string; rating: number; note: string; eventId: string; at: string };
export type Bid = {
  rec: CommunityRecord; serviceId: string; parentBidId?: string; scope: string; subtotalMinor: number; deadline: string;
  milestones: Milestone[]; buyer: string; seller: string; participants: string[]; consents: Record<string, Consent>;
  quote?: { buyerTotalMinor: number; sellerNetMinor: number; platformGrossMinor: number };
  events: BidEvent[]; reviews: Review[]; resolution?: { id: string; actor: string; note: string }; resolutionAgreements: string[];
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const s = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseBid(rec: CommunityRecord): Bid {
  const d = rec.data ?? {};
  return {
    rec, serviceId: s(d.serviceId), parentBidId: s(d.parentBidId) || undefined, scope: s(d.scope),
    subtotalMinor: typeof d.subtotalMinor === 'number' ? d.subtotalMinor : 0, deadline: s(d.deadline),
    milestones: arr<Milestone>(d.milestones), buyer: s(d.buyer), seller: s(d.seller), participants: arr<string>(d.participants),
    consents: d.consents && typeof d.consents === 'object' ? (d.consents as Record<string, Consent>) : {},
    quote: d.quote && typeof d.quote === 'object' ? (d.quote as Bid['quote']) : undefined,
    events: arr<BidEvent>(d.events), reviews: arr<Review>(d.reviews),
    resolution: d.resolution && typeof d.resolution === 'object' ? (d.resolution as Bid['resolution']) : undefined,
    resolutionAgreements: arr<string>(d.resolutionAgreements),
  };
}

/** Latest deliver event for a milestone, if no decision came after it. */
export function currentDelivery(b: Bid, m: number): BidEvent | undefined {
  let cur: BidEvent | undefined;
  for (const e of b.events) {
    if (e.milestone !== m) continue;
    if (e.action === 'deliver') cur = e;
    else if (e.action === 'accept' || e.action === 'reject') cur = undefined;
  }
  return cur;
}

export const isOverdue = (iso: string, status?: string) => !!iso && status !== 'accepted' && new Date(iso).getTime() < Date.now();
export const short = (x: string) => (x ? `${x.slice(0, 10)}` : 'unknown');
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
