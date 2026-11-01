import type { RenterView } from '@hold/mobile-api';

export const TOKEN = 'N'.repeat(65);

type Negotiation = RenterView<'negotiation'>;
type Transcript = Negotiation['transcript'];

export const negotiation = (overrides: Partial<Negotiation> = {}, transcript: Partial<Transcript> = {}): Negotiation => ({
  shopName: 'Velo Zürich',
  canAct: true,
  highestTotalCents: 3000,
  awaitingRenter: false,
  stopped: false,
  advocate: 'hold',
  transcript: {
    kind: 'negotiation',
    state: 'open',
    endedReason: null,
    currency: 'CHF',
    claimTotalCents: 4500,
    agreedCents: null,
    deadline: '2026-11-03T10:00:00.000Z',
    roundLimit: 4,
    shopConfirmedAt: null,
    renterConfirmedAt: null,
    simulated: false,
    chainVerified: true,
    lines: [{ lineId: 'line-1', publishedCents: 4500, description: 'Bent rear derailleur' }],
    wearClauses: [{ id: 'wear-1', text: 'Light scuffs on pedals are ordinary wear.' }],
    moves: [
      { sequence: 1, side: 'shop', kind: 'offer', lines: [{ lineId: 'line-1', cents: 4500, ground: 'evidence_stands', evidence: [] }], totalCents: 4500, passReason: null, model: null, createdAt: '2026-11-01T10:00:00.000Z', fingerprint: 'a1' },
      { sequence: 2, side: 'renter', kind: 'offer', lines: [{ lineId: 'line-1', cents: 2000, ground: 'ordinary_wear', evidence: ['wear-1'] }], totalCents: 2000, passReason: null, model: 'us.anthropic.claude-opus-4-6-v1', createdAt: '2026-11-01T10:01:00.000Z', fingerprint: 'b2' },
    ],
    ...transcript,
  },
  ...overrides,
});
