import type { RenterView } from '@hold/mobile-api';

export const TOKEN = 'K'.repeat(65);

type Claim = RenterView<'claim'>;

export const claim = (overrides: Partial<Claim> = {}): Claim => ({
  shopName: 'Velo Zürich',
  timeZone: 'Europe/Zurich',
  currency: 'CHF',
  state: 'presented',
  totalCents: 4500,
  captureCents: 4500,
  releaseCents: 25500,
  invoiceCents: 0,
  replyDueAt: '2026-11-04T17:00:00.000Z',
  holdState: 'placed',
  pendingSettlement: false,
  canAcknowledge: false,
  canReply: true,
  canAdvocate: false,
  canWrite: true,
  assistantName: null,
  negotiation: false,
  lines: [
    {
      id: 'line-1',
      description: 'Bent rear derailleur',
      reason: 'The derailleur hanger is bent inwards; it was straight at handover.',
      amountCents: 4500,
      actorName: 'Mia Keller',
      beforeUrl: 'https://hold.example/before.jpg',
      afterUrl: 'https://hold.example/after.jpg',
      region: { x: 0.4, y: 0.5, width: 0.2, height: 0.2 },
      repair: null,
    },
  ],
  contest: null,
  promise: { days: 3, decideBy: null, decidedAt: null, missedAt: null, standing: 'none', missedReason: null },
  messages: [],
  now: '2026-11-01T10:00:00.000Z',
  ...overrides,
});
