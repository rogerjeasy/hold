// The worked example from docs/project-description.md section 5. Amounts are fixed data, not arithmetic.
export const outcomeKeys = ['damage', 'clean'] as const

export type OutcomeKey = (typeof outcomeKeys)[number]

export const priceListKeys = ['scratchedFrame', 'missingCharger', 'bentWheel'] as const

export type PriceListKey = (typeof priceListKeys)[number]

export const exampleRental = {
  holdNumber: '2291',
  currency: 'EUR',
  reservedCents: 30000,
  feeCents: 12000,
  rentalDays: 3,
  photographCount: 6,
  handoverSeconds: 40,
  newMarkCount: 1,
  marksAtHandover: 2,
  handoverAt: new Date('2026-10-14T09:12:00Z'),
  returnAt: new Date('2026-10-17T17:48:00Z'),
  scuffFirstSeenAt: new Date('2026-09-02T10:30:00Z'),
  priceListCents: { scratchedFrame: 3500, missingCharger: 6000, bentWheel: 9000 },
  outcomes: {
    damage: { takenCents: 3500, releasedCents: 26500 },
    clean: { takenCents: 0, releasedCents: 30000 },
  },
} as const satisfies {
  outcomes: Record<OutcomeKey, { takenCents: number; releasedCents: number }>
  priceListCents: Record<PriceListKey, number>
  [key: string]: unknown
}

// A PayPal hold reserves funds for up to 29 days. Many card holds lapse in about a week. docs/tech-stack.md section 5.
export const holdLength = { paypalDays: 29, cardDays: 7, longRentalDays: 21 } as const

// The owner's view of one day, for the illustration on the shops page. Every hold is the example amount.
export const exampleShop = {
  itemsOut: 14,
  dueBack: 6,
  claimsWaiting: 1,
  holdsInPlaceCents: 420000,
  expiringHold: { number: '2274', day: 26 },
} as const
