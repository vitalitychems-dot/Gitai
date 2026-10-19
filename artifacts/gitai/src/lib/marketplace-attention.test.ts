import assert from 'node:assert/strict';
import test from 'node:test';
import type { Bid } from './bids';
import { countMarketplaceAttention, collectAttention } from './marketplace-attention';

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

test('navigation count equals participant-visible Marketplace attention items', () => {
  const proposed = makeBid('proposed', 'proposed');
  const milestone = (title: string) => ({ title, scope: title, dueAt: future(), status: 'pending' });
  const activeDeadline = makeBid('deadline', 'active', {
    milestones: [milestone('first'), milestone('second')],
  });
  const awaitingDecision = makeBid('delivery', 'active', {
    milestones: [milestone('review')],
    events: [{
      id: 'delivery-event',
      actor: 'seller',
      action: 'deliver',
      at: new Date().toISOString(),
      milestone: 0,
    }],
  });
  const disputed = makeBid('disputed', 'disputed', {
    events: [{
      id: 'dispute-event',
      actor: 'seller',
      action: 'dispute',
      at: new Date().toISOString(),
    }],
  });
  const bids = [proposed, activeDeadline, awaitingDecision, disputed];

  for (const operator of ['buyer', 'seller', 'unrelated', '']) {
    assert.equal(countMarketplaceAttention(bids, operator), collectAttention(bids, operator).length);
  }
  assert.equal(countMarketplaceAttention(bids, 'buyer'), 3);
  assert.equal(countMarketplaceAttention(bids, 'seller'), 3);
  assert.equal(countMarketplaceAttention(bids, 'unrelated'), 0);
  assert.equal(countMarketplaceAttention(bids, ''), 0);
});
