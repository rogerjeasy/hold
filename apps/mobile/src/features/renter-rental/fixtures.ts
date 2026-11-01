import type { RenterView } from '@hold/mobile-api';

// What Hold answers for one renter's rental, in tests. Each test changes only what it is about.
type Rental = RenterView<'rental'>;
type Hold = RenterView<'hold'>;

export const RENTER_TOKEN = 'R'.repeat(65);

export const rentalView = (overrides: Partial<Rental['view']> = {}): Rental['view'] => ({
  shopName: 'Velo Zürich',
  timeZone: 'Europe/Zurich',
  state: 'out',
  startsAt: '2026-11-02T08:00:00.000Z',
  endsAt: '2026-11-04T17:00:00.000Z',
  days: 2,
  currency: 'CHF',
  feeCents: 9000,
  holdCents: 60000,
  lines: [{ name: 'City e-bike', count: 1, dayRateCents: 4500, holdCents: 60000 }],
  prices: [{ description: 'Scratch on the frame', category: 'damage', amountCents: 4000 }],
  wearPolicy: 'Dust and light tyre wear are ordinary.',
  replyPeriodHours: 48,
  renterName: 'Alex',
  simulated: false,
  paymentLapsed: false,
  walkIn: false,
  ...overrides,
});

// How Hold reaches the renter: by email until they choose texts, and not yet locked by a placed hold.
export const contactView = (overrides: Partial<NonNullable<Rental['contact']>> = {}): NonNullable<Rental['contact']> => ({
  channel: 'email',
  phone: null,
  confirmed: false,
  locked: false,
  shown: [],
  ...overrides,
});

export const rentalAnswer = (view: Partial<Rental['view']> = {}, rest: Partial<Omit<Rental, 'view'>> = {}) => ({
  ok: true as const,
  value: {
    view: rentalView(view),
    canReport: false,
    canExtend: false,
    askConsent: false,
    assistant: null,
    selfReturn: { offered: false, shopClosed: false, droppedOffAt: null },
    contact: contactView(),
    ...rest,
  } satisfies Rental,
});

export const holdAnswer = (hold: Partial<NonNullable<Hold['hold']>> | null, view: Partial<Rental['view']> = {}, contact: Hold['contact'] = contactView()) => ({
  ok: true as const,
  value: {
    view: rentalView({ state: 'awaiting_hold', ...view }),
    hold:
      hold === null
        ? null
        : {
            state: 'requested',
            strategy: 'at_counter',
            reservedCents: 60000,
            ordinaryCents: 60000,
            currency: 'CHF',
            orderId: null,
            assuredUntil: null,
            validUntil: null,
            placementFailure: null,
            trust: null,
            ...hold,
          },
    contact,
  } satisfies Hold,
});

// What starting a payment answers: PayPal's page, and the order to confirm afterwards.
export const startedAnswer = (orderId = 'ORDER-1') => ({
  ok: true as const,
  value: { approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`, orderId, returnUrl: 'https://hold.example/api/mobile/v1/paypal-return/fee' },
});
