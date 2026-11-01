import 'server-only'
import { shopDay } from '@hold/domain'
import { captureSession, dropOffsWaiting, rentalDetail, rentalHandovers, rentalHold, rentalList, rentalReturns, returnBaseline, shopToday } from '@hold/db'
import type { RentalSummary, Transaction } from '@hold/db'
import { captureSessionSchema, rentalsQuery, rentalsSchema, rentalViewSchema, todaySchema } from '@hold/mobile-api'
import type { z } from 'zod'
import { decisionsFor } from '@/features/today/decisions'
import type { StaffView } from './mobile-staff'
import { getServices } from './services'

// What the phone reads at the counter, from the same repository functions as the web's pages, shaped by the
// contract's schemas: dates as ISO text, money as integer cents with its currency, and only what the role may see.

const iso = (date: Date) => date.toISOString()
const isoOrNull = (date: Date | null) => (date === null ? null : iso(date))

export const todayView: StaffView<unknown, typeof todaySchema> = {
  output: todaySchema,
  async load(context, transaction) {
    const now = new Date()
    const today = await shopToday(transaction, { now, day: shopDay(context.shop.timeZone, now) })
    return {
      shop: { id: context.shop.id, name: context.shop.name, timeZone: context.shop.timeZone, currency: context.shop.currency },
      role: context.role,
      counter: today.counter.map((visit) => ({ ...visit, at: iso(visit.at), hold: visit.hold === null ? null : { state: visit.hold.state, reservedCents: visit.hold.reservedCents }, items: [...visit.items] })),
      dropOffs: today.droppedOff.map((rental) => ({ ...rental, droppedOffAt: iso(rental.droppedOffAt) })),
      // A drop-off is checked at the counter, on the phone too. Everything else waiting is a decision for the web.
      decisions: { waiting: decisionsFor(today, now).filter((decision) => decision.kind !== 'dropped_off').length, decidedOn: 'web' as const },
    }
  },
}

const rentalFields = (rental: Omit<RentalSummary, 'items'>) => ({
  id: rental.id,
  state: rental.state,
  startsAt: iso(rental.startsAt),
  endsAt: iso(rental.endsAt),
  who: rental.who,
  feeCents: rental.feeCents,
  holdCents: rental.holdCents,
  currency: rental.currency,
  simulated: rental.simulated,
})

const summary = (rental: RentalSummary): z.input<typeof rentalsSchema>['rentals'][number] => ({ ...rentalFields(rental), items: [...rental.items] })

// A rental matches when its renter's name or one of its items holds the words, in any case.
export function matchesRental(rental: Pick<RentalSummary, 'who' | 'items'>, words: string): boolean {
  const wanted = words.trim().toLocaleLowerCase()
  return wanted === '' || [rental.who ?? '', ...rental.items].some((text) => text.toLocaleLowerCase().includes(wanted))
}

const RENTALS_SHOWN = 100

export const rentalsView: StaffView<unknown, typeof rentalsSchema> = {
  output: rentalsSchema,
  async load(_context, transaction, request) {
    const asked = rentalsQuery.safeParse({ q: new URL(request.url).searchParams.get('q') ?? undefined })
    const words = asked.success ? (asked.data.q ?? '') : ''
    const rentals = await rentalList(transaction, new Date())
    return { rentals: rentals.filter((rental) => matchesRental(rental, words)).slice(0, RENTALS_SHOWN).map(summary) }
  },
}

export const rentalView: StaffView<{ rentalId: string }, typeof rentalViewSchema> = {
  output: rentalViewSchema,
  async load(context, transaction, _request, { rentalId }) {
    const rental = await rentalDetail(transaction, rentalId, new Date())
    if (rental === undefined) return undefined
    const [hold, handovers, returns] = await Promise.all([rentalHold(transaction, rental.id), rentalHandovers(transaction, rental.id), rentalReturns(transaction, rental.id)])
    const dropOff = rental.state === 'dropped_off' ? (await dropOffsWaiting(transaction)).find((entry) => entry.rentalId === rental.id) : undefined
    return {
      ...rentalFields(rental),
      ...(context.role === 'read_only' ? {} : { contactEmail: rental.contactEmail }),
      language: rental.language,
      hold: hold === undefined ? null : { state: hold.state, reservedCents: hold.reservedCents, currency: hold.currency, assuredUntil: isoOrNull(hold.assuredUntil), validUntil: isoOrNull(hold.validUntil) },
      items: rental.items.map((item) => {
        const handover = handovers.find((each) => each.itemId === item.id)
        const back = returns.find((each) => each.itemId === item.id)
        return {
          id: item.id,
          label: item.label,
          typeName: item.typeName,
          handover: handover?.sessionId == null ? null : { sessionId: handover.sessionId, sealed: handover.sealed },
          return: back?.sessionId == null ? null : { sessionId: back.sessionId, sealed: back.sealed, comparisonId: back.comparisonId },
        }
      }),
      dropOff: dropOff === undefined ? null : { droppedOffAt: iso(dropOff.droppedOffAt), missingAt: isoOrNull(dropOff.missingAt) },
      canAct: context.role !== 'read_only',
    }
  },
}

async function shown(photos: readonly { readonly view: string; readonly displayKey: string | null; readonly simulated?: boolean }[]) {
  const { evidence } = await getServices()
  return Promise.all(photos.map(async (photo) => ({ view: photo.view, simulated: photo.simulated === true, url: photo.displayKey === null || evidence === undefined ? null : await evidence.displayLink(photo.displayKey) })))
}

// The handover or return the camera works through. Another kind of session, such as a renter's, reads as not found.
export const captureSessionView: StaffView<{ sessionId: string }, typeof captureSessionSchema> = {
  output: captureSessionSchema,
  async load(context, transaction: Transaction, _request, { sessionId }) {
    const session = await captureSession(transaction, sessionId)
    if (session === undefined || (session.kind !== 'handover' && session.kind !== 'return') || session.byRenter) return undefined
    const ghost = session.kind === 'return' ? await returnBaseline(transaction, session.id) : []
    return {
      id: session.id,
      kind: session.kind,
      rentalId: session.rentalId,
      itemLabel: session.itemLabel,
      sealed: session.sealedAt !== null,
      plan: session.plan.map((view) => ({ ...view })),
      photos: await shown(session.photos),
      marks: session.marks.map((mark) => ({ ...mark, region: { ...mark.region } })),
      missing: [...session.missing],
      ghost: await shown(ghost),
      canAct: context.role !== 'read_only',
    }
  },
}
