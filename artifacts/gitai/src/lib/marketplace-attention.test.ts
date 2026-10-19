import assert from 'node:assert/strict';
import test from 'node:test';
import type { Bid } from './bids';
import { countMarketplaceAttention, collectAttention } from './marketplace-attention';

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function makeBid(id: string, status: string, overrides: Partial<Bid> = {}): Bid {
  return {
    rec: {
      id,
      kind: 'bid',
      title: id,
      body: '',
      owner: 'buyer',
      status,
      createdAt: new Date().toISOString(),
      data: {},
    },
    serviceId: 'service-1',
    scope: 'synthetic test scope',
    subtotalMinor: 10000,
    deadline: future(),
    milestones: [],
    buyer: 'buyer',
    seller: 'seller',
    participants: ['buyer', 'seller'],
    consents: {},
    events: [],
    reviews: [],
    resolutionAgreements: [],
    ...overrides,
  };
}

const milestone = (title: string, status = 'pending', dueAt = future()) => ({ title, scope: title, dueAt, status });
const event = (id: string, actor: string, action: string, milestoneIndex?: number) => ({
  id,
  actor,
  action,
  at: new Date().toISOString(),
  ...(milestoneIndex === undefined ? {} : { milestone: milestoneIndex }),
});
const kindsFor = (bid: Bid, operator: string) => collectAttention([bid], operator).map((item) => item.kind);

test('consent is visible only to unconsented participants while all deadlines are open', () => {
  const proposed = makeBid('proposed', 'proposed');
  assert.deepEqual(kindsFor(proposed, 'buyer'), ['consent']);
  assert.deepEqual(kindsFor(proposed, 'seller'), ['consent']);
  assert.deepEqual(kindsFor(proposed, 'outsider'), []);

  const buyerConsented = makeBid('buyer-consented', 'proposed', {
    consents: { buyer: { operatorKind: 'human', operatorLabel: 'Buyer', at: new Date().toISOString() } },
  });
  assert.deepEqual(kindsFor(buyerConsented, 'buyer'), []);
  assert.deepEqual(kindsFor(buyerConsented, 'seller'), ['consent']);
  assert.deepEqual(kindsFor(buyerConsented, 'outsider'), []);

  const expiredDeadline = makeBid('expired-deadline', 'proposed', { deadline: past() });
  const expiredMilestone = makeBid('expired-milestone', 'proposed', {
    milestones: [milestone('Late milestone', 'pending', past())],
  });
  for (const bid of [expiredDeadline, expiredMilestone]) {
    assert.deepEqual(kindsFor(bid, 'buyer'), []);
    assert.deepEqual(kindsFor(bid, 'seller'), []);
    assert.deepEqual(kindsFor(bid, 'outsider'), []);
  }
});

test('only the seller sees pending or rejected milestone deadlines, ranked overdue first', () => {
  const bid = makeBid('deadlines', 'active', {
    milestones: [
      milestone('Upcoming', 'pending'),
      milestone('Overdue', 'rejected', past()),
      milestone('Already accepted', 'accepted', past()),
    ],
  });
  const sellerItems = collectAttention([bid], 'seller');
  assert.deepEqual(sellerItems.map((item) => item.kind), ['deadline', 'deadline']);
  assert.deepEqual(sellerItems.map((item) => item.title), ['Overdue: Overdue', 'Upcoming: Upcoming']);
  assert.deepEqual(kindsFor(bid, 'buyer'), []);
  assert.deepEqual(kindsFor(bid, 'outsider'), []);

  const hasOutstandingDelivery = makeBid('delivered', 'active', {
    milestones: [milestone('Submitted', 'pending')],
    events: [event('delivery-1', 'seller', 'deliver', 0)],
  });
  assert.deepEqual(kindsFor(hasOutstandingDelivery, 'seller'), []);
  assert.deepEqual(kindsFor(hasOutstandingDelivery, 'buyer'), ['delivery']);
  assert.deepEqual(kindsFor(hasOutstandingDelivery, 'outsider'), []);
});

test('a delivery awaits the buyer, and accept/reject decisions clear that delivery', () => {
  const delivered = makeBid('delivery', 'active', {
    milestones: [milestone('Review')],
    events: [event('delivery-1', 'seller', 'deliver', 0)],
  });
  assert.deepEqual(kindsFor(delivered, 'buyer'), ['delivery']);
  assert.deepEqual(kindsFor(delivered, 'seller'), []);
  assert.deepEqual(kindsFor(delivered, 'outsider'), []);

  const accepted = makeBid('accepted-delivery', 'active', {
    milestones: [milestone('Review', 'accepted')],
    events: [event('delivery-1', 'seller', 'deliver', 0), event('accept-1', 'buyer', 'accept', 0)],
  });
  assert.deepEqual(kindsFor(accepted, 'buyer'), []);
  assert.deepEqual(kindsFor(accepted, 'seller'), []);
  assert.deepEqual(kindsFor(accepted, 'outsider'), []);

  const rejected = makeBid('rejected-delivery', 'active', {
    milestones: [milestone('Revise', 'rejected')],
    events: [event('delivery-1', 'seller', 'deliver', 0), event('reject-1', 'buyer', 'reject', 0)],
  });
  assert.deepEqual(kindsFor(rejected, 'buyer'), []);
  assert.deepEqual(kindsFor(rejected, 'seller'), ['deadline']);
  assert.deepEqual(kindsFor(rejected, 'outsider'), []);

  const redelivered = makeBid('redelivered', 'active', {
    milestones: [milestone('Revise', 'rejected')],
    events: [
      event('delivery-1', 'seller', 'deliver', 0),
      event('reject-1', 'buyer', 'reject', 0),
      event('delivery-2', 'seller', 'deliver', 0),
    ],
  });
  assert.deepEqual(kindsFor(redelivered, 'buyer'), ['delivery']);
  assert.deepEqual(kindsFor(redelivered, 'seller'), []);
  assert.deepEqual(kindsFor(redelivered, 'outsider'), []);
});

test('disputes await the other party or an unagreed resolution participant', () => {
  const sellerRaised = makeBid('seller-raised', 'disputed', {
    events: [event('dispute-1', 'seller', 'dispute')],
  });
  assert.deepEqual(kindsFor(sellerRaised, 'buyer'), ['dispute']);
  assert.deepEqual(kindsFor(sellerRaised, 'seller'), []);
  assert.deepEqual(kindsFor(sellerRaised, 'outsider'), []);

  const buyerRaised = makeBid('buyer-raised', 'disputed', {
    events: [event('dispute-2', 'buyer', 'dispute')],
  });
  assert.deepEqual(kindsFor(buyerRaised, 'buyer'), []);
  assert.deepEqual(kindsFor(buyerRaised, 'seller'), ['dispute']);
  assert.deepEqual(kindsFor(buyerRaised, 'outsider'), []);

  const resolution = makeBid('resolution', 'disputed', {
    events: [event('resolution-proposal', 'seller', 'propose-resolution')],
    resolution: { id: 'resolution-1', actor: 'seller', note: 'Synthetic resolution' },
  });
  assert.deepEqual(collectAttention([resolution], 'buyer').map((item) => item.title), ['A resolution awaits your response']);
  assert.deepEqual(kindsFor(resolution, 'seller'), []);
  assert.deepEqual(kindsFor(resolution, 'outsider'), []);

  const responseRecorded = makeBid('resolution-accepted', 'disputed', {
    events: [
      event('resolution-proposal', 'seller', 'propose-resolution'),
      event('resolution-agreement', 'buyer', 'agree-resolution'),
    ],
    resolution: { id: 'resolution-1', actor: 'seller', note: 'Synthetic resolution' },
    resolutionAgreements: ['buyer'],
  });
  assert.deepEqual(kindsFor(responseRecorded, 'buyer'), []);
  assert.deepEqual(kindsFor(responseRecorded, 'seller'), ['dispute']);
  assert.deepEqual(kindsFor(responseRecorded, 'outsider'), []);
});

test('the navigation count remains the same participant-visible attention list', () => {
  const bids = [
    makeBid('consent', 'proposed'),
    makeBid('deadline', 'active', { milestones: [milestone('Build')] }),
    makeBid('delivery', 'active', {
      milestones: [milestone('Review')],
      events: [event('delivery-event', 'seller', 'deliver', 0)],
    }),
    makeBid('dispute', 'disputed', { events: [event('dispute-event', 'seller', 'dispute')] }),
  ];
  for (const operator of ['buyer', 'seller', 'outsider', '']) {
    assert.equal(countMarketplaceAttention(bids, operator), collectAttention(bids, operator).length);
  }
  assert.equal(countMarketplaceAttention(bids, 'buyer'), 3);
  assert.equal(countMarketplaceAttention(bids, 'seller'), 2);
  assert.equal(countMarketplaceAttention(bids, 'outsider'), 0);
  assert.equal(countMarketplaceAttention(bids, ''), 0);
});
