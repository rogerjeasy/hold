import type { RentalDetail, RentalSummary } from '@hold/db'

// Rentals for the screen tests: one in each part of a rental's life.

const rental = (id: string, overrides: Partial<RentalSummary>): RentalSummary => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  state: 'pending_payment',
  startsAt: new Date('2026-10-16T09:00:00Z'),
  endsAt: new Date('2026-10-19T09:00:00Z'),
  who: 'Priya Natarajan',
  items: ['City e-bike 1'],
  feeCents: 120_00,
  holdCents: 300_00,
  currency: 'EUR',
  bookedThrough: 'staff',
  simulated: false,
  paymentLapsed: false,
  ...overrides,
})

export const rentals = {
  waiting: rental('a1', {}),
  lapsed: rental('a2', { who: null, paymentLapsed: true, bookedThrough: 'shop_page' }),
  booked: rental('a3', { state: 'booked', who: 'Lukas Weber', items: ['City e-bike 2', 'City e-bike 3'] }),
  out: rental('a4', { state: 'out', who: 'Sofia Marques' }),
  sample: rental('a5', { state: 'closed', who: 'Julia Novak', simulated: true }),
  assistant: rental('a6', { state: 'booked', who: 'Mei Tanaka', bookedThrough: 'assistant' }),
}

export const detail = (overrides: Partial<RentalDetail> = {}): RentalDetail => ({
  ...rentals.waiting,
  contactName: 'Priya Natarajan',
  contactEmail: 'priya@example.com',
  contactChannel: 'email',
  contactPhone: null,
  renterName: null,
  language: 'en',
  createdAt: new Date('2026-10-15T09:00:00Z'),
  priceListVersion: 2,
  renterErasedAt: null,
  items: [{ id: 'item-1', label: 'City e-bike 1', typeName: 'City e-bike' }],
  ...overrides,
})
