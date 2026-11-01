import type { RenterView } from '@hold/mobile-api';

export const TOKEN = 'R'.repeat(65);
export const SESSION = '9c4f5e3b-6a7d-4e8f-b1a2-3c4d5e6f7a81';

type Return = RenterView<'return'>;

export const selfReturn = (overrides: Partial<Return> = {}): Return => ({
  shopName: 'Velo Zürich',
  simulated: false,
  canAct: true,
  stage: 'intro',
  rentalState: 'out',
  dropPoint: 'The blue locker left of the door, code 4412.',
  opening: { open: false, opensAt: '2026-11-02T08:00:00.000Z' },
  timeZone: 'Europe/Zurich',
  currency: 'CHF',
  droppedOffAt: null,
  onTime: true,
  missingAt: null,
  hold: { reservedCents: 30000, state: 'placed' },
  paypal: null,
  items: [],
  ...overrides,
});

export const item = (overrides: Partial<Return['items'][number]> = {}): Return['items'][number] => ({
  sessionId: SESSION,
  label: 'City bike, blue',
  views: [
    { key: 'left', label: 'Left side', outline: 'whole_side' },
    { key: 'drop-point', label: 'Drop point', outline: 'whole_side' },
  ],
  missing: ['left', 'drop-point'],
  photos: [],
  guides: { left: 'https://hold.example/handover-left.jpg' },
  ...overrides,
});
