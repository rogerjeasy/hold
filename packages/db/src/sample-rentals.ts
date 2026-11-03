import { createHash } from 'node:crypto'
import { addDays, decideByFor, DROP_POINT_VIEW, manifestText, SAMPLE_PHOTO_SHA256, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS, shopDay, suggestedPhotoPlan, viewKeys } from '@hold/domain'
import type { ClaimState, HoldState, ItemCategory, PriceCategory, Region, RentalState } from '@hold/domain'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import {
  approvals,
  auditLog,
  authorizations,
  captureSessions,
  claimLines,
  claimMessages,
  claimReplies,
  claims,
  comparisons,
  findings,
  holds,
  items,
  itemTypes,
  marks,
  moneyEvents,
  photoPlans,
  photos,
  priceEntries,
  priceLists,
  rentalItems,
  rentals,
  shopExceptions,
  shops,
  wearPolicies,
} from './schema/index.ts'
import { writeProposal } from './ops-repository.ts'
import { openRepairsForClaim } from './repair-repository.ts'
import type { Transaction } from './scope.ts'

// Sample rentals for a demonstration (architecture.md section 20.3): a shop's day with items out, returns due,
// claims to decide and a hold near its end. Every rental is marked simulated, every PayPal reference starts with
// SIMULATED, and every audit line says so, so nothing here can pass for a real rental or a real payment.

type SampleItem = 'hybrid' | 'ebike' | 'kayak' | 'gravel' | 'seat' | 'emtb'

// Each sample rental's fee is one day of each of its items.
const CATALOG: Record<
  SampleItem,
  { readonly name: string; readonly category: ItemCategory; readonly holdCents: number; readonly dayRateCents: number; readonly valueCents: number }
> = {
  hybrid: { name: 'Hybrid bike', category: 'bike', holdCents: 250_00, dayRateCents: 25_00, valueCents: 900_00 },
  ebike: { name: 'E-bike', category: 'e_bike', holdCents: 300_00, dayRateCents: 45_00, valueCents: 2400_00 },
  kayak: { name: 'Tandem kayak', category: 'water', holdCents: 450_00, dayRateCents: 60_00, valueCents: 1300_00 },
  gravel: { name: 'Gravel bike', category: 'bike', holdCents: 300_00, dayRateCents: 35_00, valueCents: 1600_00 },
  seat: { name: 'Child seat', category: 'other', holdCents: 50_00, dayRateCents: 8_00, valueCents: 120_00 },
  emtb: { name: 'E-mountain bike', category: 'e_bike', holdCents: 500_00, dayRateCents: 70_00, valueCents: 4200_00 },
}

// The suggested plan for a category, worded in English like the rest of the samples: "frame_left" reads "Frame left".
function samplePlan(category: ItemCategory) {
  const views = suggestedPhotoPlan(category).map((view) => {
    const words = view.key.replace(/_/g, ' ')
    return { label: words.charAt(0).toUpperCase() + words.slice(1), outline: view.outline, required: view.required }
  })
  const keys = viewKeys(views)
  return views.map((view, index) => ({ ...view, key: keys[index] ?? view.label }))
}

// The sample photographs, one frame taken at the handover and again at the return with a chip in the paint, and an
// e-bike left at a drop point. Their display keys are reserved: the web app serves them from its own sample images, so
// no shop's bucket holds them.
export const SAMPLE_PHOTOS = { handover: 'sample/sample-handover.jpg', damage: 'sample/sample-return-damage.jpg', dropPoint: 'sample/sample-drop-point.jpg' } as const
const SAMPLE_SHA256 = SAMPLE_PHOTO_SHA256
// Where each mark is on those photographs, as fractions of the frame.
const SCUFF: Region = { x: 0.285, y: 0.77, width: 0.04, height: 0.07 }
const CHIP: Region = { x: 0.36, y: 0.505, width: 0.075, height: 0.16 }

// A moment as days, hours and minutes from the start of the shop's day, or as minutes from now. Today's handovers
// and returns are set from now, so the day reads the same whenever the samples are added: one done, the rest to come.
type Moment = readonly [days: number, hours: number, minutes: number] | { readonly fromNow: number }

type SampleRental = {
  readonly renter: string
  readonly items: readonly SampleItem[]
  readonly starts: Moment
  readonly ends: Moment
  readonly state: RentalState
  readonly hold: Extract<HoldState, 'requested' | 'placed' | 'released' | 'captured'>
  // The first published price of this kind is the one claimed.
  // presented: shown to the renter and still waiting for their reply, so the advocates can be asked to argue it. also:
  // a second line, added by a person at the counter with no finding behind it.
  readonly claim?: { readonly state: Extract<ClaimState, 'awaiting_approval' | 'presented' | 'contested' | 'charged'>; readonly kind: PriceCategory; readonly also?: PriceCategory; readonly reply?: string }
  // Photographed at the handover and the return, and compared: the claim rests on the finding.
  readonly photographed?: true
  // What the operations agent would propose about it, had it read sample rentals: shown as a sample, it moves nothing.
  readonly proposal?: 'replacement_hold' | 'dispute_answer'
  // Returned by the renter with nobody at the counter, at this moment, and compared overnight (architecture.md 6.13).
  readonly droppedOff?: Moment
}

const SAMPLES: readonly SampleRental[] = [
  { renter: 'Lukas Weber', items: ['hybrid'], starts: { fromNow: -110 }, ends: [3, 18, 0], state: 'out', hold: 'placed' },
  { renter: 'Sofia Marques', items: ['ebike', 'ebike'], starts: [-1, 10, 0], ends: { fromNow: 45 }, state: 'out', hold: 'placed' },
  // Placed so that its assured period ends later today, after the return.
  { renter: 'Inês Costa', items: ['kayak'], starts: { fromNow: 360 - 3 * 24 * 60 }, ends: { fromNow: 90 }, state: 'out', hold: 'placed' },
  { renter: 'Hannah Svensson', items: ['gravel'], starts: { fromNow: 210 }, ends: [2, 18, 0], state: 'awaiting_hold', hold: 'requested' },
  { renter: 'Ahmed Khan', items: ['hybrid', 'seat'], starts: [-1, 16, 30], ends: { fromNow: 300 }, state: 'out', hold: 'placed' },
  { renter: 'Lea Fischer', items: ['emtb'], starts: [-4, 10, 0], ends: [-1, 18, 0], state: 'overdue', hold: 'placed' },
  { renter: 'Chloé Martin', items: ['ebike'], starts: [-3, 10, 0], ends: [-1, 22, 0], state: 'dropped_off', hold: 'placed', droppedOff: [-1, 21, 40] },
  { renter: 'Marco Rossi', items: ['ebike'], starts: [-26, 10, 0], ends: [-1, 17, 0], state: 'returned', hold: 'placed', proposal: 'replacement_hold' },
  { renter: 'Priya Natarajan', items: ['hybrid'], starts: [-6, 10, 0], ends: [-1, 17, 30], state: 'settling', hold: 'placed', claim: { state: 'awaiting_approval', kind: 'damage' }, photographed: true },
  {
    renter: 'Tom Becker',
    items: ['gravel'],
    starts: [-5, 10, 0],
    ends: [-2, 12, 0],
    state: 'settling',
    hold: 'placed',
    claim: { state: 'contested', kind: 'loss', reply: 'The lock was in the bag when I handed it back.' },
  },
  // Waits for the renter's reply: the claim a judge can hand to the two advocates (extensions.md section 9).
  { renter: 'Elena Duarte', items: ['ebike'], starts: [-4, 10, 0], ends: [-1, 18, 0], state: 'settling', hold: 'placed', claim: { state: 'presented', kind: 'damage', also: 'cleaning' }, photographed: true },
  { renter: 'Julia Novak', items: ['ebike'], starts: [-9, 10, 0], ends: [-7, 17, 0], state: 'closed', hold: 'released' },
  { renter: 'Daniel Ortiz', items: ['hybrid'], starts: [-8, 9, 0], ends: [-6, 18, 0], state: 'closed', hold: 'captured', claim: { state: 'charged', kind: 'damage' }, photographed: true, proposal: 'dispute_answer' },
]

const MINUTE = 60 * 1000
const SIMULATED = { simulated: true } as const

export type SampleRentalsResult = { readonly ok: true; readonly rentals: number } | { readonly ok: false; readonly reason: 'no_price_list' | 'has_rentals' }

export type SampleRentalsInput = {
  readonly shopId: string
  readonly userId: string
  readonly timeZone: string
  readonly now: Date
  // Who raised the sample claims at the counter. In a demo it is the counter staff, so the owner, who did not raise
  // the contested one, may decide it (architecture.md section 7.3). Otherwise the person adding the samples.
  readonly raisedByUserId?: string
}

async function publishedTerms(transaction: Transaction) {
  const [list] = await transaction
    .select({ id: priceLists.id, version: priceLists.version, currency: priceLists.currency })
    .from(priceLists)
    .where(isNotNull(priceLists.publishedAt))
    .orderBy(desc(priceLists.version))
    .limit(1)
  if (list === undefined) return undefined
  const [wear] = await transaction.select({ id: wearPolicies.id }).from(wearPolicies).where(and(eq(wearPolicies.version, list.version), isNotNull(wearPolicies.publishedAt)))
  if (wear === undefined) return undefined
  const entries = await transaction
    .select({ id: priceEntries.id, amountCents: priceEntries.amountCents, category: priceEntries.category })
    .from(priceEntries)
    .where(eq(priceEntries.priceListId, list.id))
    .orderBy(asc(priceEntries.position))
  return entries.length === 0 ? undefined : { priceListId: list.id, wearPolicyId: wear.id, currency: list.currency, entries }
}

export async function addSampleRentals(transaction: Transaction, input: SampleRentalsInput): Promise<SampleRentalsResult> {
  const terms = await publishedTerms(transaction)
  if (terms === undefined) return { ok: false, reason: 'no_price_list' }
  const [existing] = await transaction.select({ count: sql<number>`count(*)::int` }).from(rentals)
  if ((existing?.count ?? 0) > 0) return { ok: false, reason: 'has_rentals' }

  const { shopId, userId, now } = input
  const raiser = input.raisedByUserId ?? userId
  const day = shopDay(input.timeZone, now)
  const moment = (at: Moment): Date => {
    if ('fromNow' in at) {
      const target = now.getTime() + at.fromNow * MINUTE
      // A visit set from now stays on today's counter, however late in the day the samples are added.
      return Math.abs(at.fromNow) >= 24 * 60 ? new Date(target) : new Date(Math.min(Math.max(target, day.start.getTime() + MINUTE), day.end.getTime() - MINUTE))
    }
    const [days, hours, minutes] = at
    return new Date(addDays(day.start, days).getTime() + (hours * 60 + minutes) * MINUTE)
  }
  // Money and claims land inside this month and before now, so the month's figures always show them.
  const inMonth = (at: Date) => new Date(Math.min(Math.max(at.getTime(), day.monthStart.getTime()), now.getTime() - MINUTE))
  const { currency } = terms
  const [promise] = await transaction.select({ days: shops.decisionPromiseDays, closes: shops.closesAt }).from(shops).where(eq(shops.id, shopId))

  const typeIds = new Map<SampleItem, string>()
  const planIds = new Map<SampleItem, string>()
  const typeOf = (key: SampleItem) => {
    const typeId = typeIds.get(key)
    if (typeId === undefined) throw new Error(`No sample item type for ${key}.`)
    return typeId
  }
  for (const [key, item] of Object.entries(CATALOG) as [SampleItem, (typeof CATALOG)[SampleItem]][]) {
    const [plan] = await transaction
      .insert(photoPlans)
      .values({ shopId, name: item.name, views: samplePlan(item.category), createdAt: now })
      .returning({ id: photoPlans.id })
    if (plan === undefined) throw new Error('A sample photo plan was not created.')
    const [type] = await transaction
      .insert(itemTypes)
      .values({
        shopId,
        name: item.name,
        category: item.category,
        currency,
        valueCents: item.valueCents,
        holdCents: item.holdCents,
        dayRateCents: item.dayRateCents,
        photoPlanId: plan.id,
        simulated: true,
        createdAt: now,
      })
      .returning({ id: itemTypes.id })
    if (type === undefined) throw new Error('A sample item type was not created.')
    typeIds.set(key, type.id)
    planIds.set(key, plan.id)
  }
  const numbered = new Map<SampleItem, number>()

  for (const [index, sample] of SAMPLES.entries()) {
    const [first = '', last = ''] = sample.renter.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').split(' ')
    const [renter] = await transaction
      .select({ id: sql<string>`renter.id` })
      .from(sql`hold_renter_for_payer(${`SAMPLE-${shopId}-${String(index + 1)}`}, ${`${first}.${last}@renter.invalid`}, ${sample.renter}) as renter(id)`)
    if (renter === undefined) throw new Error('hold_renter_for_payer returned no row.')
    const startsAt = moment(sample.starts)
    const endsAt = moment(sample.ends)
    const reservedCents = sample.items.reduce((sum, key) => sum + CATALOG[key].holdCents, 0)
    const feeCents = sample.items.reduce((sum, key) => sum + CATALOG[key].dayRateCents, 0)

    const [rental] = await transaction
      .insert(rentals)
      .values({ shopId, renterId: renter.id, startsAt, endsAt, currency, feeCents, holdCents: reservedCents, priceListId: terms.priceListId, wearPolicyId: terms.wearPolicyId, state: sample.state, simulated: true, createdAt: inMonth(startsAt) })
      .returning({ id: rentals.id })
    if (rental === undefined) throw new Error('A sample rental was not created.')
    const reference = (kind: string) => `SIMULATED-${rental.id}-${kind}`
    const audit = (action: string, at: Date, actorKind = 'person', actorId = userId) =>
      transaction.insert(auditLog).values({ shopId, actorKind, actorId: actorKind === 'person' ? actorId : null, action, subjectKind: 'rental', subjectId: rental.id, detail: SIMULATED, at })

    const rentalItemIds: { readonly key: SampleItem; readonly itemId: string; readonly rentalItemId: string }[] = []
    for (const key of sample.items) {
      const number = (numbered.get(key) ?? 0) + 1
      numbered.set(key, number)
      const [item] = await transaction
        .insert(items)
        .values({ shopId, itemTypeId: typeOf(key), label: `${CATALOG[key].name} ${String(number)}`, simulated: true, createdAt: now })
        .returning({ id: items.id })
      if (item === undefined) throw new Error('A sample item was not created.')
      const [rentalItem] = await transaction
        .insert(rentalItems)
        .values({ shopId, rentalId: rental.id, itemId: item.id, dayRateCents: CATALOG[key].dayRateCents, holdCents: CATALOG[key].holdCents })
        .returning({ id: rentalItems.id })
      if (rentalItem === undefined) throw new Error('A sample rental item was not created.')
      rentalItemIds.push({ key, itemId: item.id, rentalItemId: rentalItem.id })
    }
    await transaction.insert(moneyEvents).values({ shopId, rentalId: rental.id, kind: 'fee_captured', currency, amountCents: feeCents, paypalReference: reference('fee'), occurredAt: inMonth(startsAt) })

    const [hold] = await transaction
      .insert(holds)
      .values({ shopId, rentalId: rental.id, currency, reservedCents, strategy: 'at_counter', state: sample.hold, createdAt: startsAt })
      .returning({ id: holds.id })
    if (hold === undefined) throw new Error('A sample hold was not created.')
    if (sample.hold === 'requested') continue

    const authorizationState = sample.hold === 'placed' ? 'created' : sample.hold === 'released' ? 'voided' : 'captured'
    const [authorization] = await transaction
      .insert(authorizations)
      .values({
        shopId,
        holdId: hold.id,
        paypalAuthorizationId: reference('authorization'),
        currency,
        amountCents: reservedCents,
        createdAt: startsAt,
        assuredUntil: addDays(startsAt, HOLD_ASSURED_DAYS),
        validUntil: addDays(startsAt, HOLD_VALIDITY_DAYS),
        state: authorizationState,
      })
      .returning({ id: authorizations.id })
    if (authorization === undefined) throw new Error('A sample authorization was not created.')
    await transaction.update(holds).set({ currentAuthorizationId: authorization.id }).where(eq(holds.id, hold.id))
    await transaction.insert(moneyEvents).values({ shopId, rentalId: rental.id, holdId: hold.id, kind: 'hold_placed', currency, amountCents: reservedCents, paypalReference: reference('placed'), occurredAt: inMonth(startsAt) })
    await audit(sample.state === 'out' && startsAt >= day.start ? 'handover.done' : 'hold.placed', startsAt)

    const [droppedItem] = rentalItemIds
    if (sample.droppedOff !== undefined && droppedItem !== undefined) {
      const droppedOffAt = moment(sample.droppedOff)
      const damage = terms.entries.find((each) => each.category === 'damage') ?? terms.entries[0]
      if (damage === undefined) throw new Error('The price list has no entries.')
      await photographSample(transaction, { shopId, userId, item: droppedItem, planId: planIds.get(droppedItem.key) ?? '', view: samplePlan(CATALOG[droppedItem.key].category)[0]?.key ?? 'frame', startsAt, endsAt: droppedOffAt, priceEntryId: damage.id, byRenter: true })
      await transaction.update(rentals).set({ droppedOffAt }).where(eq(rentals.id, rental.id))
      await audit('renter.self_return_sent', droppedOffAt, 'renter')
    }

    let capturedCents = 0
    if (sample.claim !== undefined) {
      const kind = sample.claim.kind
      const entry = terms.entries.find((each) => each.category === kind) ?? terms.entries[0]
      if (entry === undefined) throw new Error('The price list has no entries.')
      const also = sample.claim.also === undefined ? undefined : terms.entries.find((each) => each.category === sample.claim?.also)
      const raisedAt = inMonth(new Date(endsAt.getTime() + 60 * MINUTE))
      const presented = sample.claim.state !== 'awaiting_approval'
      // A claim still waiting for its reply stays open for a week, so a judge who comes back to the demo can still
      // hand it to the advocates.
      const replyDueAt = sample.claim.state === 'presented' ? new Date(now.getTime() + 7 * 24 * 60 * MINUTE) : null
      const [claim] = await transaction
        .insert(claims)
        .values({ shopId, rentalId: rental.id, currency, totalCents: entry.amountCents + (also?.amountCents ?? 0), state: sample.claim.state, raisedByUserId: raiser, presentedAt: presented ? raisedAt : null, replyDueAt, promiseDays: presented ? (promise?.days ?? null) : null, createdAt: raisedAt })
        .returning({ id: claims.id })
      if (claim === undefined) throw new Error('A sample claim was not created.')
      const [photographed] = rentalItemIds
      const findingId =
        sample.photographed === true && photographed !== undefined
          ? await photographSample(transaction, { shopId, userId, item: photographed, planId: planIds.get(photographed.key) ?? '', view: samplePlan(CATALOG[photographed.key].category)[0]?.key ?? 'frame', startsAt, endsAt, priceEntryId: entry.id })
          : undefined
      await transaction.insert(claimLines).values({
        shopId,
        claimId: claim.id,
        priceEntryId: entry.id,
        currency,
        amountCents: entry.amountCents,
        source: findingId === undefined ? 'person' : 'finding',
        findingId: findingId ?? null,
        addedByUserId: raiser,
        // A line on a finding speaks through the finding; any other says it is a sample.
        reason: findingId === undefined ? 'Sample data, added to show how a claim looks.' : null,
        createdAt: raisedAt,
      })
      if (also !== undefined) {
        await transaction.insert(claimLines).values({ shopId, claimId: claim.id, priceEntryId: also.id, currency, amountCents: also.amountCents, source: 'person', findingId: null, addedByUserId: raiser, reason: 'Sample data: mud on the chain and the frame at the return, cleaned at the counter.', createdAt: raisedAt })
      }
      await audit('claim.raised', raisedAt, 'person', raiser)
      if (sample.claim.state === 'presented') await audit('claim.presented', raisedAt, 'person', raiser)
      if (sample.claim.reply !== undefined) {
        const repliedAt = inMonth(new Date(raisedAt.getTime() + 18 * 60 * MINUTE))
        await transaction.insert(claimReplies).values({ shopId, claimId: claim.id, decision: 'contest', comment: sample.claim.reply, createdAt: repliedAt })
        await audit('claim.contested', repliedAt, 'renter')
        // The shop's promise to decide it, still open, and what renter and shop wrote since (architecture.md 6.16).
        if (promise !== undefined) await transaction.update(claims).set({ decideBy: decideByFor({ contestedAt: repliedAt, days: promise.days, timeZone: input.timeZone, closes: promise.closes, validUntil: null }) }).where(eq(claims.id, claim.id))
        await transaction.insert(claimMessages).values([
          { shopId, claimId: claim.id, author: 'renter', authorUserId: null, body: 'The lock was in the side pocket of the bag. Could someone check there?', createdAt: inMonth(new Date(repliedAt.getTime() + 60 * MINUTE)) },
          { shopId, claimId: claim.id, author: 'shop', authorUserId: raiser, body: 'Thank you, we will check the side pocket and the return photographs, and decide before the date above.', createdAt: inMonth(new Date(repliedAt.getTime() + 3 * 60 * MINUTE)) },
        ])
      }
      if (sample.claim.state === 'charged') {
        await transaction.insert(approvals).values({ shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: userId, decision: 'approved', method: 'on_screen', createdAt: raisedAt })
        capturedCents = entry.amountCents
        // The damage paid for goes on the item's passport and opens a repair, as a confirmed charge does (section 9.6).
        await openRepairsForClaim(transaction, claim.id, raisedAt)
      }
    }

    if (sample.hold === 'released' || sample.hold === 'captured') {
      const settledAt = inMonth(new Date(endsAt.getTime() + 2 * 60 * MINUTE + (capturedCents > 0 ? 24 * 60 * MINUTE : 0)))
      if (capturedCents > 0) {
        await transaction.insert(moneyEvents).values({ shopId, rentalId: rental.id, holdId: hold.id, kind: 'hold_captured', currency, amountCents: capturedCents, paypalReference: reference('captured'), occurredAt: settledAt })
        await audit('hold.captured', settledAt)
      }
      await transaction
        .insert(moneyEvents)
        .values({ shopId, rentalId: rental.id, holdId: hold.id, kind: 'hold_released', currency, amountCents: reservedCents - capturedCents, paypalReference: reference('released'), occurredAt: settledAt })
      await audit('hold.released', settledAt, capturedCents > 0 ? 'system' : 'person')
    }
    if (sample.proposal === 'replacement_hold') {
      const validUntil = addDays(startsAt, HOLD_VALIDITY_DAYS)
      await sampleProposal(transaction, { exception: { kind: 'hold_ending', subjectKind: 'hold', subjectId: hold.id, rentalId: rental.id, deadline: validUntil, moneyCents: reservedCents }, kind: 'request_replacement_hold', references: [reference('authorization')], draft: null }, now)
    }
    if (sample.proposal === 'dispute_answer') {
      const dispute = reference('dispute')
      await sampleProposal(transaction, { exception: { kind: 'dispute_open', subjectKind: 'dispute', subjectId: dispute, rentalId: rental.id, deadline: addDays(now, 9), moneyCents: capturedCents }, kind: 'respond_to_dispute', references: [dispute, reference('captured')], draft: SAMPLE_DISPUTE_ANSWER }, now)
    }
  }
  // A shop that had not yet chosen a currency takes the price list's, as publishing it would have done.
  await transaction.update(shops).set({ currency }).where(and(eq(shops.id, shopId), sql`${shops.currency} is null`))
  return { ok: true, rentals: SAMPLES.length }
}

// The answer the sample dispute proposal offers to send. It names no amount: an amount comes only from the records.
const SAMPLE_DISPUTE_ANSWER = 'The renter returned the bike with a scratch through the paint on the frame. It is in the return photograph and not in the handover photograph, and both are in the evidence pack attached. The renter saw both photographs and the price from the published list, and accepted the claim before it was charged.'

// The detector's own words for each sample, as the operations agent writes them when no model ran.
const SAMPLE_REASONS = { hold_ending: 'The hold ends within three days and the rental is still open.', dispute_open: 'A PayPal dispute is waiting for a response.' } as const

type SampleProposal = {
  readonly exception: { readonly kind: keyof typeof SAMPLE_REASONS; readonly subjectKind: string; readonly subjectId: string; readonly rentalId: string; readonly deadline: Date; readonly moneyCents: number }
  readonly kind: 'request_replacement_hold' | 'respond_to_dispute'
  readonly references: readonly string[]
  readonly draft: string | null
}

// One exception and the proposal for it, as a run would write them, marked as a sample: approving it records the
// decision and carries nothing out (decideProposal), so no PayPal call is ever made with a sample's references.
async function sampleProposal(transaction: Transaction, sample: SampleProposal, now: Date): Promise<void> {
  const { exception } = sample
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const [row] = await transaction.insert(shopExceptions).values({ shopId: shop.id, ...exception, fingerprint: `sample:${exception.kind}:${exception.subjectId}`, detectedAt: now }).returning({ id: shopExceptions.id })
  if (row === undefined) throw new Error('A sample exception was not created.')
  const written = await writeProposal(transaction, { exceptionId: row.id, kind: sample.kind, reason: SAMPLE_REASONS[exception.kind], references: sample.references, draft: sample.draft, raisedByAgent: false, runId: null, model: null, promptVersion: null, payload: { fixedReason: exception.kind, investigated: 'no', paypalChecked: 'no', simulated: 'yes' } }, now)
  if (!written.written) throw new Error(`A sample proposal was not written: ${written.reason ?? 'unknown'}.`)
}

type PhotographedSample = {
  readonly shopId: string
  readonly userId: string
  readonly item: { readonly itemId: string; readonly rentalItemId: string }
  readonly planId: string
  readonly view: string
  readonly startsAt: Date
  readonly endsAt: Date
  readonly priceEntryId: string
  // The renter photographed the return through their link, and where they left the item.
  readonly byRenter?: true
}

// One view photographed at the handover and again at the return, the faint scuff on record from the handover, and the
// comparison that found the chip and set the scuff aside. Marked simulated: no model ran, and the photographs are the
// demonstration's samples. Returns the finding the claim rests on.
async function photographSample(transaction: Transaction, sample: PhotographedSample): Promise<string> {
  const { shopId, userId, item, view } = sample
  const byRenter = sample.byRenter === true
  const session = async (kind: 'handover' | 'return', at: Date, shots: readonly (readonly [string, keyof typeof SAMPLE_PHOTOS])[]) => {
    const renters = kind === 'return' && byRenter
    const [row] = await transaction
      .insert(captureSessions)
      .values({ shopId, rentalItemId: item.rentalItemId, kind, photoPlanId: sample.planId, actorUserId: renters ? null : userId, byRenter: renters, startedAt: at, sealedAt: at })
      .returning({ id: captureSessions.id })
    if (row === undefined) throw new Error('A sample capture session was not created.')
    const taken: { view: string; sha256: string; receivedAt: Date }[] = []
    for (const [shotView, photo] of shots) {
      taken.push({ view: shotView, sha256: SAMPLE_SHA256[photo], receivedAt: at })
      await transaction.insert(photos).values({
        shopId,
        sessionId: row.id,
        view: shotView,
        evidenceKey: `sample/${shopId}/${row.id}/${shotView}.jpg`,
        displayKey: SAMPLE_PHOTOS[photo],
        sha256: SAMPLE_SHA256[photo],
        receivedAt: at,
        quality: { simulated: 1 },
      })
    }
    // Sealed into the item's chain as any session is, so the rental's record can be built from it.
    const [chained] = await transaction.select({ head: items.chainHeadFingerprint }).from(items).where(eq(items.id, item.itemId))
    const previous = chained?.head ?? null
    const manifest = manifestText({ sessionId: row.id, itemId: item.itemId, kind, sealedAt: at, previousManifestFingerprint: previous, photos: taken })
    const fingerprint = createHash('sha256').update(manifest).digest('hex')
    await transaction.update(captureSessions).set({ manifest, manifestFingerprint: fingerprint, previousManifestFingerprint: previous }).where(eq(captureSessions.id, row.id))
    await transaction.update(items).set({ chainHeadFingerprint: fingerprint }).where(eq(items.id, item.itemId))
    return row.id
  }
  const handover = await session('handover', sample.startsAt, [[view, 'handover']])
  const returned = await session('return', sample.endsAt, byRenter ? [[view, 'damage'], [DROP_POINT_VIEW, 'dropPoint']] : [[view, 'damage']])
  const [scuff] = await transaction
    .insert(marks)
    .values({ shopId, itemId: item.itemId, view, region: SCUFF, description: 'A faint scuff on the down tube.', firstSeenSessionId: handover })
    .returning({ id: marks.id })
  if (scuff === undefined) throw new Error('A sample mark was not created.')
  const [comparison] = await transaction
    .insert(comparisons)
    .values({ shopId, handoverSessionId: handover, returnSessionId: returned, state: 'findings', simulated: true, createdAt: sample.endsAt, completedAt: sample.endsAt })
    .returning({ id: comparisons.id })
  if (comparison === undefined) throw new Error('A sample comparison was not created.')
  await transaction.insert(findings).values({
    shopId,
    comparisonId: comparison.id,
    view,
    region: SCUFF,
    class: 'known_mark',
    confidence: 0.9,
    description: 'The faint scuff on the down tube, recorded at the handover. It is not charged again.',
    matchedMarkId: scuff.id,
  })
  const [chip] = await transaction
    .insert(findings)
    .values({
      shopId,
      comparisonId: comparison.id,
      view,
      region: CHIP,
      class: 'new_damage',
      confidence: 0.93,
      description: 'A chip in the paint on the down tube, through to the bare metal. It was not there at the handover.',
      secondLookConfirmed: true,
      suggestedPriceEntryId: sample.priceEntryId,
    })
    .returning({ id: findings.id })
  if (chip === undefined) throw new Error('A sample finding was not created.')
  return chip.id
}
