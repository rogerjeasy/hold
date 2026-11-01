import type { CaptureSessionView, Me, RentalSummary, RentalView, Today } from '@hold/mobile-api';
import { staffSession } from '@/storage/staff-session';

// What Hold answers the counter's screens in tests: one shop's day, one rental and one item's photographs.

export const SHOP_ID = '0b8f4f2e-5f1e-4c1a-9a35-2f7f6f0e8a01';
export const OTHER_SHOP_ID = '1c9a5a3f-6a2f-4d2b-8b46-3a8a7a1f9b12';
export const RENTAL_ID = '2d0b6b4a-7b3a-4e3c-9c57-4b9b8b2a0c23';
export const ITEM_ID = '3e1c7c5b-8c4b-4f4d-8d68-5c0c9c3b1d34';
export const SECOND_ITEM_ID = '4f2d8d6c-9d5c-4a5e-9e79-6d1d0d4c2e45';
export const SESSION_ID = '5a3e9e7d-0e6d-4b6f-8f80-7e2e1e5d3f56';
export const COMPARISON_ID = '6b4f0f8e-1f7e-4c70-9a91-8f3f2f6e4a67';
export const MARK_ID = '7c5a1a9f-2a8f-4d81-8ba2-9a4a3a7f5b78';
export const NEW_MARK_ID = '8d6b2bab-3b9a-4e92-9cb3-ab5b4b8a6c89';

// A member of staff signed in on this phone, working in the shop.
export const signInStaff = (expiresAt = '2099-01-01T00:00:00.000Z') => staffSession.write({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt, shopId: SHOP_ID });

export const TODAY: Today = {
  shop: { id: SHOP_ID, name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', currency: 'EUR' },
  role: 'counter_staff',
  counter: [
    { rentalId: RENTAL_ID, kind: 'handover', at: '2026-11-01T09:30:00.000Z', renterName: 'Priya Raman', items: ['City e-bike 4'], done: false, hold: { state: 'placed', reservedCents: 30000 }, simulated: false },
    { rentalId: '9e7c3cbc-4cab-4fa3-8dc4-bc6c5c9b7d90', kind: 'return', at: '2026-11-01T17:00:00.000Z', renterName: null, items: ['Helmet M'], done: true, hold: null, simulated: true },
  ],
  dropOffs: [{ rentalId: RENTAL_ID, renterName: 'Priya Raman', droppedOffAt: '2026-11-01T07:40:00.000Z', simulated: false }],
  decisions: { waiting: 3, decidedOn: 'web' },
};

export const EMPTY_TODAY: Today = { ...TODAY, counter: [], dropOffs: [], decisions: { waiting: 0, decidedOn: 'web' } };

export const RENTAL_SUMMARY: RentalSummary = {
  id: RENTAL_ID,
  state: 'ready',
  startsAt: '2026-11-01T09:30:00.000Z',
  endsAt: '2026-11-03T17:00:00.000Z',
  who: 'Priya Raman',
  items: ['City e-bike 4'],
  feeCents: 4800,
  holdCents: 30000,
  currency: 'EUR',
  simulated: false,
};

export const RENTAL: RentalView = {
  id: RENTAL_ID,
  state: 'ready',
  startsAt: '2026-11-01T09:30:00.000Z',
  endsAt: '2026-11-03T17:00:00.000Z',
  who: 'Priya Raman',
  feeCents: 4800,
  holdCents: 30000,
  currency: 'EUR',
  simulated: false,
  contactEmail: 'priya@example.com',
  language: 'en',
  hold: { state: 'placed', reservedCents: 30000, currency: 'EUR', assuredUntil: '2026-11-04T09:30:00.000Z', validUntil: '2026-11-30T09:30:00.000Z' },
  items: [{ id: ITEM_ID, label: 'City e-bike 4', typeName: 'City e-bike', handover: null, return: null }],
  dropOff: null,
  canAct: true,
};

export const HANDOVER: CaptureSessionView = {
  id: SESSION_ID,
  kind: 'handover',
  rentalId: RENTAL_ID,
  itemLabel: 'City e-bike 4',
  sealed: false,
  plan: [
    { key: 'frame_left', label: 'Frame, left side', outline: 'whole_side', required: true },
    { key: 'frame_right', label: 'Frame, right side', outline: 'whole_side', required: true },
    { key: 'display', label: 'Display', outline: 'detail', required: false },
  ],
  photos: [],
  marks: [],
  missing: ['frame_left', 'frame_right'],
  ghost: [],
  canAct: true,
};

export const ME: Me = { name: 'Jonas Weber', email: 'jonas@ribeira.example', shops: [{ shopId: SHOP_ID, name: 'Ribeira Bikes', role: 'counter_staff' }] };
