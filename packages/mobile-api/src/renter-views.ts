import { CLAIM_STATES, CONDITION_REPLIES, ESCALATION_REASONS, HOLD_STATES, INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_STATES, MOVE_KINDS, NEGOTIATION_KINDS, NEGOTIATION_SIDES, NEGOTIATION_STATES, PASS_REASONS, PRICE_CATEGORIES, RENTAL_STATES, VIEW_OUTLINES } from '@hold/domain'
import { z } from 'zod'

// What each renter screen reads (architecture.md section 13.8), the same as the renter's web page shows. The server
// parses what its page loader returned through these, so only the fields named here leave it: nothing a renter's page
// does not already show, and nothing the web page needs only for PayPal's button. Times are ISO strings; amounts are
// integer cents beside their currency code.

const instant = z.iso.datetime({ offset: true })
const cents = z.number().int()
const region = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
// A display copy through a short-lived signed link, faces blurred. Null while the shop's worker prepares it.
const photoUrl = z.string().nullable()

const rentalView = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  state: z.enum(RENTAL_STATES),
  startsAt: instant,
  endsAt: instant,
  days: z.number().int(),
  currency: z.string(),
  feeCents: cents,
  holdCents: cents,
  lines: z.array(z.object({ name: z.string(), count: z.number().int(), dayRateCents: cents, holdCents: cents })),
  prices: z.array(z.object({ description: z.string(), category: z.enum(PRICE_CATEGORIES), amountCents: cents })),
  wearPolicy: z.string(),
  replyPeriodHours: z.number(),
  renterName: z.string().nullable(),
  simulated: z.boolean(),
  paymentLapsed: z.boolean(),
  walkIn: z.boolean(),
})

// How Hold reaches the renter (architecture.md section 12.3): the channel, the number masked, whether they confirmed it,
// whether a new number now needs a code from the channel trusted (locked, once the hold is placed), and the last texts
// a demo shop showed instead of sending. Null only where the rental could not be read.
const contactView = z
  .object({
    channel: z.enum(['email', 'text']),
    phone: z.string().nullable(),
    confirmed: z.boolean(),
    locked: z.boolean(),
    shown: z.array(z.object({ id: z.string(), body: z.string() })),
  })
  .nullable()

// The rental: what the renter rents, the fee, the hold, the prices and wear policy, and what they may do next.
export const renterRentalSchema = z.object({
  view: rentalView,
  canReport: z.boolean(),
  canExtend: z.boolean(),
  askConsent: z.boolean(),
  assistant: z.object({ connected: z.boolean(), revoked: z.boolean() }).nullable(),
  selfReturn: z.object({ offered: z.boolean(), shopClosed: z.boolean(), droppedOffAt: instant.nullable() }),
  contact: contactView,
})

// The hold at pickup. orderId: the PayPal order waiting for approval, if any.
export const renterHoldSchema = z.object({
  view: rentalView,
  hold: z
    .object({
      state: z.enum(HOLD_STATES),
      strategy: z.enum(['at_counter', 'combined', 'saved_method']),
      reservedCents: cents,
      ordinaryCents: cents,
      currency: z.string(),
      orderId: z.string().nullable(),
      assuredUntil: instant.nullable(),
      validUntil: instant.nullable(),
      placementFailure: z.string().nullable(),
      trust: z.object({ version: z.number().int(), rung: z.number().int(), cleanReturns: z.number().int(), windowMonths: z.number().int() }).nullable(),
    })
    .nullable(),
  contact: contactView,
})

// The condition report sent at handover. Only the link sent with it may answer (canReply).
export const renterConditionSchema = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  open: z.boolean(),
  reply: z.enum(CONDITION_REPLIES).nullable(),
  closesAt: instant,
  canReply: z.boolean(),
  items: z.array(
    z.object({
      itemId: z.string(),
      label: z.string(),
      photos: z.array(z.object({ view: z.string(), label: z.string(), url: photoUrl })),
      marks: z.array(z.object({ id: z.string(), view: z.string(), region, description: z.string() })),
      added: z.array(z.object({ view: z.string(), url: photoUrl })),
    }),
  ),
})

const contestView = z.object({
  outcome: z.enum(['answered', 'refused', 'unavailable', 'invalid', 'dropped', 'pending']),
  simulated: z.boolean(),
  // The renter's version of the summary, in their language. The model's words, about the renter's words only.
  version: z.object({ overview: z.string(), lines: z.array(z.object({ lineId: z.string(), disputed: z.boolean(), renterSays: z.string().nullable(), renterQuote: z.string().nullable() })) }).nullable(),
  comment: z.string(),
  lines: z.array(z.object({ id: z.string(), description: z.string(), source: z.string(), findingDescription: z.string().nullable(), bothLooksConfirmed: z.boolean(), knownMarkNearby: z.boolean(), addedBy: z.string().nullable(), reason: z.string() })),
  rental: z.object({ conditionReply: z.enum(CONDITION_REPLIES).nullable(), conditionRepliedAt: instant.nullable(), renterPhotos: z.number().int(), incidentsReported: z.number().int() }),
})

// The claim as its renter sees it, once a person approved it, and what they may do about it.
export const renterClaimSchema = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  currency: z.string(),
  state: z.enum(CLAIM_STATES),
  totalCents: cents,
  captureCents: cents,
  releaseCents: cents,
  invoiceCents: cents,
  replyDueAt: instant.nullable(),
  holdState: z.enum(HOLD_STATES),
  pendingSettlement: z.boolean(),
  canAcknowledge: z.boolean(),
  canReply: z.boolean(),
  canAdvocate: z.boolean(),
  canWrite: z.boolean(),
  assistantName: z.string().nullable(),
  negotiation: z.boolean(),
  lines: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      reason: z.string(),
      amountCents: cents,
      actorName: z.string().nullable(),
      beforeUrl: photoUrl,
      afterUrl: photoUrl,
      region: region.nullable(),
      repair: z.object({ repairedAt: instant, url: photoUrl }).nullable(),
    }),
  ),
  contest: contestView.nullable(),
  promise: z.object({ days: z.number().int(), decideBy: instant.nullable(), decidedAt: instant.nullable(), missedAt: instant.nullable(), standing: z.enum(['none', 'open', 'kept', 'missed']), missedReason: z.string().nullable() }).nullable(),
  messages: z.array(z.object({ id: z.string(), author: z.enum(['renter', 'shop']), authorName: z.string().nullable(), body: z.string(), createdAt: instant })),
  now: instant,
})

// The advocates' negotiation on a contested claim: the verified transcript, the renter's own highest total, and
// whether their confirmation is awaited.
export const renterNegotiationSchema = z.object({
  shopName: z.string(),
  canAct: z.boolean(),
  highestTotalCents: cents,
  awaitingRenter: z.boolean(),
  stopped: z.boolean(),
  advocate: z.enum(['hold', 'assistant']),
  transcript: z.object({
    kind: z.enum(NEGOTIATION_KINDS),
    state: z.enum(NEGOTIATION_STATES),
    endedReason: z.enum(ESCALATION_REASONS).nullable(),
    currency: z.string(),
    claimTotalCents: cents,
    agreedCents: cents.nullable(),
    deadline: instant,
    roundLimit: z.number().int(),
    shopConfirmedAt: instant.nullable(),
    renterConfirmedAt: instant.nullable(),
    simulated: z.boolean(),
    chainVerified: z.boolean(),
    lines: z.array(z.object({ lineId: z.string(), publishedCents: cents, description: z.string() })),
    wearClauses: z.array(z.object({ id: z.string(), text: z.string() })),
    moves: z.array(
      z.object({
        sequence: z.number().int(),
        side: z.enum(NEGOTIATION_SIDES),
        kind: z.enum(MOVE_KINDS),
        lines: z.array(z.object({ lineId: z.string(), cents, ground: z.string().nullable(), evidence: z.array(z.string()) })),
        totalCents: cents.nullable(),
        passReason: z.enum(PASS_REASONS).nullable(),
        model: z.string().nullable(),
        createdAt: instant,
        fingerprint: z.string(),
      }),
    ),
  }),
})

// Keeping the item longer. canAct: this link may ask and pay. quote: the days priced and waiting for PayPal.
export const renterExtensionSchema = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  currency: z.string(),
  state: z.enum(RENTAL_STATES),
  simulated: z.boolean(),
  canAct: z.boolean(),
  endsAt: instant,
  suggestedEnd: z.string(),
  maxDays: z.number().int(),
  latestEnd: instant.nullable(),
  holdCents: cents.nullable(),
  quote: z.object({ extraDays: z.number().int(), feeCents: cents, endsAt: instant }).nullable(),
  extensions: z.array(z.object({ id: z.string(), orderId: z.string().nullable(), extraDays: z.number().int(), amountCents: cents, toEndsAt: instant, state: z.enum(['paid', 'capturing', 'failed']) })),
})

// "Something happened": the items that may be reported on while the renter has them, and earlier reports.
export const renterIncidentsSchema = z.object({
  shopName: z.string(),
  open: z.boolean(),
  items: z.array(z.object({ itemId: z.string(), label: z.string() })),
  earlier: z.array(z.object({ id: z.string(), state: z.enum(INCIDENT_STATES), kind: z.enum(INCIDENT_KINDS).nullable(), itemLabel: z.string(), reportedAt: instant })),
})

const captureView = z.object({ key: z.string(), label: z.string(), outline: z.enum(VIEW_OUTLINES) })
const capturedPhoto = z.object({ view: z.string(), url: photoUrl, simulated: z.boolean() })
// The handover photograph of each view, by view, shown faintly behind the camera to match the angle.
const guides = z.record(z.string(), z.string())

// One report: the renter's words, its photographs while it is written, then what the sorting found. offer: a price a
// staff member confirmed, which the renter may agree with a one-time code.
export const renterIncidentSchema = z.object({
  shopName: z.string(),
  incident: z.object({
    id: z.string(),
    state: z.enum(INCIDENT_STATES),
    kind: z.enum(INCIDENT_KINDS).nullable(),
    hint: z.enum(INCIDENT_HINTS),
    description: z.string(),
    confirmation: z.string().nullable(),
    currency: z.string(),
    agreedCents: cents.nullable(),
    theftDetails: z.object({ where: z.string(), when: z.string(), lockAndKeys: z.string(), policeReport: z.string() }).nullable(),
    simulated: z.boolean(),
    reportedAt: instant,
    sentAt: instant.nullable(),
    itemId: z.string(),
    itemLabel: z.string(),
    offer: z.object({ description: z.string(), amountCents: cents, currency: z.string() }).nullable(),
  }),
  capture: z.object({ views: z.array(captureView), photos: z.array(capturedPhoto), guides }),
})

// Returning the item with nobody at the counter, and the receipt once sent. paypal: what PayPal says of the hold now.
export const renterReturnSchema = z.object({
  shopName: z.string(),
  simulated: z.boolean(),
  canAct: z.boolean(),
  stage: z.enum(['unavailable', 'intro', 'capture', 'sent']),
  rentalState: z.enum(RENTAL_STATES),
  dropPoint: z.string().nullable(),
  opening: z.union([z.object({ open: z.literal(true) }), z.object({ open: z.literal(false), opensAt: instant })]).nullable(),
  timeZone: z.string(),
  currency: z.string(),
  droppedOffAt: instant.nullable(),
  onTime: z.boolean(),
  missingAt: instant.nullable(),
  hold: z.object({ reservedCents: cents, state: z.enum(HOLD_STATES) }).nullable(),
  paypal: z.object({ status: z.string(), amountCents: cents, checkedAt: instant }).nullable(),
  items: z.array(z.object({ sessionId: z.string(), label: z.string(), views: z.array(captureView), missing: z.array(z.string()), photos: z.array(capturedPhoto), guides })),
})

// The rental's record: each published version, and the receipts sent with them.
export const renterRecordSchema = z.object({
  shopName: z.string(),
  versions: z.array(z.object({ id: z.string(), version: z.number().int(), state: z.string(), createdAt: instant, pdfSha256: z.string().nullable(), manifestFingerprint: z.string().nullable() })),
  receipts: z.array(z.object({ id: z.string(), packId: z.string(), kind: z.string(), status: z.string(), amountCents: cents.nullable(), releasedCents: cents.nullable(), createdAt: instant, sentAt: instant.nullable() })),
})

// The Clean Record: counts, deposits never taken, consent, and a fresh credential with its QR code (an SVG).
export const renterTrustSchema = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  own: z
    .object({
      record: z.object({ clean: z.number().int(), settled: z.number().int(), unpaid: z.number().int(), open: z.number().int(), shops: z.number().int(), windowMonths: z.number().int() }),
      neverTaken: z.array(z.object({ amount: z.object({ cents, currency: z.string() }), rentals: z.number().int() })),
      consent: z.object({ answered: z.boolean(), consented: z.boolean() }),
    })
    .nullable(),
  credential: z.object({ token: z.string(), url: z.string(), qr: z.string(), expiresAt: instant }).nullable(),
})

// What the renter's own assistant did on the rental. Its name is what it called itself; nothing about it is verified.
export const renterAssistantSchema = z.object({
  shopName: z.string(),
  timeZone: z.string(),
  currency: z.string(),
  clientLabel: z.string(),
  connected: z.boolean(),
  revokedAt: instant.nullable(),
  draftReply: z.object({ decision: z.enum(['accept', 'contest']), comment: z.string() }).nullable(),
  actions: z.array(z.object({ tool: z.string(), outcome: z.string(), at: instant })),
})

// Every screen read as GET /api/mobile/v1/renter/<name>. One incident is GET .../renter/incident/<id>.
export const renterViews = {
  rental: renterRentalSchema,
  hold: renterHoldSchema,
  condition: renterConditionSchema,
  claim: renterClaimSchema,
  negotiation: renterNegotiationSchema,
  extension: renterExtensionSchema,
  incidents: renterIncidentsSchema,
  return: renterReturnSchema,
  record: renterRecordSchema,
  trust: renterTrustSchema,
  assistant: renterAssistantSchema,
}

export type RenterViewName = keyof typeof renterViews
export const isRenterViewName = (name: string): name is RenterViewName => Object.hasOwn(renterViews, name)
export type RenterView<Name extends RenterViewName> = z.output<(typeof renterViews)[Name]>
export type RenterIncidentView = z.output<typeof renterIncidentSchema>
