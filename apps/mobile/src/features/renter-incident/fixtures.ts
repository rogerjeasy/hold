import type { RenterIncidentView, RenterView } from '@hold/mobile-api';

// A rental's reports as Hold answers them, for the tests.
export const TOKEN = 'I'.repeat(65);
export const BIKE = '6f1c2b0e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
export const HELMET = '7a2d3c1f-4e5b-4c6d-9e0f-1a2b3c4d5e6f';
export const INCIDENT = '8b3e4d2a-5f6c-4d7e-a0f1-2b3c4d5e6f70';

export const incidents = (overrides: Partial<RenterView<'incidents'>> = {}): RenterView<'incidents'> => ({
  shopName: 'Velo Zürich',
  open: true,
  items: [
    { itemId: BIKE, label: 'City bike, blue' },
    { itemId: HELMET, label: 'Helmet M' },
  ],
  earlier: [],
  ...overrides,
});

type Incident = RenterIncidentView['incident'];

export const incident = (overrides: Partial<Incident> = {}, capture: Partial<RenterIncidentView['capture']> = {}): RenterIncidentView => ({
  shopName: 'Velo Zürich',
  incident: {
    id: INCIDENT,
    state: 'reported',
    kind: null,
    hint: 'damage',
    description: 'Scraped the left pedal on a kerb.',
    confirmation: null,
    currency: 'CHF',
    agreedCents: null,
    theftDetails: null,
    simulated: false,
    reportedAt: '2026-11-01T09:30:00.000Z',
    sentAt: null,
    itemId: BIKE,
    itemLabel: 'City bike, blue',
    offer: null,
    ...overrides,
  },
  capture: {
    views: [
      { key: 'left', label: 'Left side', outline: 'whole_side' },
      { key: 'right', label: 'Right side', outline: 'whole_side' },
    ],
    photos: [],
    guides: { left: 'https://hold.example/handover-left.jpg' },
    ...capture,
  },
});

export const sent = (overrides: Partial<Incident> = {}) => incident({ sentAt: '2026-11-01T09:40:00.000Z', state: 'triaged', ...overrides });
