import { addDays, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS, shopDay, suggestedPhotoPlan, viewKeys } from '@hold/domain'
import type { ClaimState, HoldState, ItemCategory, RentalState } from '@hold/domain'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import {
  approvals,
  auditLog,
  authorizations,
  claimLines,
  claimReplies,
  claims,
  holds,
  items,
  itemTypes,
  moneyEvents,
  photoPlans,
  priceEntries,
  priceLists,
  rentalItems,
  rentals,
  shops,
  wearPolicies,
} from './schema/index.ts'
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
  readonly claim?: { readonly state: Extract<ClaimState, 'awaiting_approval' | 'contested' | 'charged'>; readonly entry: number; readonly reply?: string }
}

const SAMPLES: readonly SampleRental[] = [
  { renter: 'Lukas Weber', items: ['hybrid'], starts: { fromNow: -110 }, ends: [3, 18, 0], state: 'out', hold: 'placed' },
  { renter: 'Sofia Marques', items: ['ebike', 'ebike'], starts: [-1, 10, 0], ends: { fromNow: 45 }, state: 'out', hold: 'placed' },
  // Placed so that its assured period ends later today, after the return.
  { renter: 'Inês Costa', items: ['kayak'], starts: { fromNow: 360 - 3 * 24 * 60 }, ends: { fromNow: 90 }, state: 'out', hold: 'placed' },
  { renter: 'Hannah Svensson', items: ['gravel'], starts: { fromNow: 210 }, ends: [2, 18, 0], state: 'awaiting_hold', hold: 'requested' },
  { renter: 'Ahmed Khan', items: ['hybrid', 'seat'], starts: [-1, 16, 30], ends: { fromNow: 300 }, state: 'out', hold: 'placed' },
  { renter: 'Lea Fischer', items: ['emtb'], starts: [-4, 10, 0], ends: [-1, 18, 0], state: 'overdue', hold: 'placed' },
  { renter: 'Marco Rossi', items: ['ebike'], starts: [-26, 10, 0], ends: [-1, 17, 0], state: 'returned', hold: 'placed' },
  { renter: 'Priya Natarajan', items: ['hybrid'], starts: [-6, 10, 0], ends: [-1, 17, 30], state: 'settling', hold: 'placed', claim: { state: 'awaiting_approval', entry: 0 } },
  {
    renter: 'Tom Becker',
    items: ['gravel'],
    starts: [-5, 10, 0],
    ends: [-2, 12, 0],
    state: 'settling',
    hold: 'placed',
    claim: { state: 'contested', entry: 1, reply: 'The lock was in the bag when I handed it back.' },
  },
  { renter: 'Julia Novak', items: ['ebike'], starts: [-9, 10, 0], ends: [-7, 17, 0], state: 'closed', hold: 'released' },
  { renter: 'Daniel Ortiz', items: ['hybrid'], starts: [-8, 9, 0], ends: [-6, 18, 0], state: 'closed', hold: 'captured', claim: { state: 'charged', entry: 0 } },
]

const MINUTE = 60 * 1000
const SIMULATED = { simulated: true } as const

export type SampleRentalsResult = { readonly ok: true; readonly rentals: number } | { readonly ok: false; readonly reason: 'no_price_list' | 'has_rentals' }

export type SampleRentalsInput = { readonly shopId: string; readonly userId: string; readonly timeZone: string; readonly now: Date }

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
    .select({ id: priceEntries.id, amountCents: priceEntries.amountCents })
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

  const typeIds = new Map<SampleItem, string>()
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
    const audit = (action: string, at: Date, actorKind = 'person') =>
      transaction.insert(auditLog).values({ shopId, actorKind, actorId: actorKind === 'person' ? userId : null, action, subjectKind: 'rental', subjectId: rental.id, detail: SIMULATED, at })

    for (const key of sample.items) {
      const number = (numbered.get(key) ?? 0) + 1
      numbered.set(key, number)
      const [item] = await transaction
        .insert(items)
        .values({ shopId, itemTypeId: typeOf(key), label: `${CATALOG[key].name} ${String(number)}`, simulated: true, createdAt: now })
        .returning({ id: items.id })
      if (item === undefined) throw new Error('A sample item was not created.')
      await transaction.insert(rentalItems).values({ shopId, rentalId: rental.id, itemId: item.id, dayRateCents: CATALOG[key].dayRateCents, holdCents: CATALOG[key].holdCents })
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

    let capturedCents = 0
    if (sample.claim !== undefined) {
      const entry = terms.entries[sample.claim.entry % terms.entries.length]
      if (entry === undefined) throw new Error('The price list has no entries.')
      const raisedAt = inMonth(new Date(endsAt.getTime() + 60 * MINUTE))
      const presented = sample.claim.state !== 'awaiting_approval'
      const [claim] = await transaction
        .insert(claims)
        .values({ shopId, rentalId: rental.id, currency, totalCents: entry.amountCents, state: sample.claim.state, raisedByUserId: userId, presentedAt: presented ? raisedAt : null, createdAt: raisedAt })
        .returning({ id: claims.id })
      if (claim === undefined) throw new Error('A sample claim was not created.')
      await transaction.insert(claimLines).values({
        shopId,
        claimId: claim.id,
        priceEntryId: entry.id,
        currency,
        amountCents: entry.amountCents,
        source: 'person',
        addedByUserId: userId,
        reason: 'Sample data, added to show how a claim looks.',
        createdAt: raisedAt,
      })
      await audit('claim.raised', raisedAt)
      if (sample.claim.reply !== undefined) {
        const repliedAt = inMonth(new Date(raisedAt.getTime() + 18 * 60 * MINUTE))
        await transaction.insert(claimReplies).values({ shopId, claimId: claim.id, decision: 'contest', comment: sample.claim.reply, createdAt: repliedAt })
        await audit('claim.contested', repliedAt, 'renter')
      }
      if (sample.claim.state === 'charged') {
        await transaction.insert(approvals).values({ shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: userId, decision: 'approved', method: 'on_screen', createdAt: raisedAt })
        capturedCents = entry.amountCents
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
  }
  // A shop that had not yet chosen a currency takes the price list's, as publishing it would have done.
  await transaction.update(shops).set({ currency }).where(and(eq(shops.id, shopId), sql`${shops.currency} is null`))
  return { ok: true, rentals: SAMPLES.length }
}
