import { checkReportedRegion, guardNumbers, INCIDENT_LIMITS, INCIDENT_TRANSITIONS, mayAgree, mayConfirmOffer, mayMakeShopMatter, sortIncident, transition } from '@hold/domain'
import type { IncidentHint, IncidentKind, IncidentState, IncidentTriage, Region } from '@hold/domain'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import { liveLink, storeRenterCode } from './claim-code-repository.ts'
import { claimStaff } from './claim-access.ts'
import { sealSession } from './capture-repository.ts'
import { captureSessions, incidents, items, itemTypes, marks, photos, priceEntries, rentalItems, rentals, shops, staffRoles, users } from './schema/index.ts'
import type { TheftDetails } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The incident desk (extensions.md section 10): a renter's report during a rental, its photographs, how code and the
// model sorted it, the price a staff member confirmed, and the line the renter agreed. Nothing here charges anything or
// calls PayPal; an agreed line reaches the claim at the return, where a person confirms it.

const refused = <Reason extends string>(reason: Reason) => ({ ok: false, reason }) as const
const OPEN_RENTAL = ['out', 'overdue']
const LANGUAGES = ['en', 'fr', 'es', 'de']
// A mark's words are the start of the renter's own.
const MARK_DESCRIPTION_LENGTH = 200
const THEFT_FIELD_LENGTH = 300

async function lockedIncident(transaction: Transaction, incidentId: string, rentalId?: string) {
  const [incident] = await transaction.select().from(incidents).where(rentalId === undefined ? eq(incidents.id, incidentId) : and(eq(incidents.id, incidentId), eq(incidents.rentalId, rentalId))).for('update')
  return incident
}

// Moves an incident along its machine, refusing any move it does not list.
async function move(transaction: Transaction, incidentId: string, from: IncidentState, to: IncidentState, set: Partial<typeof incidents.$inferInsert> = {}) {
  if (!transition(INCIDENT_TRANSITIONS, from, to).ok) throw new Error(`An incident cannot move from ${from} to ${to}.`)
  await transaction.update(incidents).set({ ...set, state: to }).where(eq(incidents.id, incidentId))
}

export type NewIncident = { readonly rentalId: string; readonly itemId: string; readonly hint: IncidentHint; readonly description: string; readonly language: string }

// The renter's words are stored first, with a capture session of kind incident for their photographs. The session uses
// the plan of the item's handover, so each photograph is of a view the handover shows, and every view is optional.
export async function startIncident(transaction: Transaction, report: NewIncident, now: Date) {
  const description = report.description.trim()
  if (description === '' || description.length > INCIDENT_LIMITS.descriptionLength) return refused('description_invalid')
  const [row] = await transaction
    .select({ rentalItemId: rentalItems.id, shopId: rentals.shopId, state: rentals.state, currency: rentals.currency })
    .from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(eq(rentalItems.rentalId, report.rentalId), eq(rentalItems.itemId, report.itemId)))
    .for('update', { of: rentals })
  if (row === undefined) return refused('not_found')
  if (!OPEN_RENTAL.includes(row.state)) return refused('not_out')
  const [handover] = await transaction.select({ planId: captureSessions.photoPlanId, sealedAt: captureSessions.sealedAt }).from(captureSessions)
    .where(and(eq(captureSessions.rentalItemId, row.rentalItemId), eq(captureSessions.kind, 'handover')))
  if (handover?.sealedAt == null) return refused('not_out')
  const [session] = await transaction.insert(captureSessions).values({ shopId: row.shopId, rentalItemId: row.rentalItemId, kind: 'incident', photoPlanId: handover.planId, actorUserId: null, startedAt: now }).returning({ id: captureSessions.id })
  if (session === undefined) throw new Error('The incident session was not created.')
  const [created] = await transaction.insert(incidents).values({
    shopId: row.shopId, rentalId: report.rentalId, rentalItemId: row.rentalItemId, sessionId: session.id, hint: report.hint, description,
    language: LANGUAGES.includes(report.language) ? report.language : 'en', currency: row.currency, reportedAt: now,
  }).returning({ id: incidents.id })
  if (created === undefined) throw new Error('The incident was not created.')
  return { ok: true, incidentId: created.id, sessionId: session.id } as const
}

export type MarkedBox = { readonly view: string; readonly region: Region }

// Sends the report: its photographs are sealed into the item's chain, and a box the renter drew becomes a mark
// reported during this rental. Then what the model needs to sort it, all of it data: the renter's words, their
// choice, and the codes of the price list they agreed to. No amount is passed.
export async function sendIncident(transaction: Transaction, rentalId: string, incidentId: string, box: MarkedBox | null, now: Date) {
  const incident = await lockedIncident(transaction, incidentId, rentalId)
  if (incident === undefined) return refused('not_found')
  if (incident.state !== 'reported' || incident.sentAt !== null) return refused('already_sent')
  const taken = await transaction.select({ view: photos.view }).from(photos).where(and(eq(photos.sessionId, incident.sessionId), isNull(photos.supersededAt)))
  if (box !== null && (!taken.some((photo) => photo.view === box.view) || !checkReportedRegion(box.region))) return refused('region_invalid')
  // Sent closes the session: photographs are sealed into the item's chain, and none can be added after.
  await transaction.update(incidents).set({ sentAt: now }).where(eq(incidents.id, incidentId))
  if (taken.length > 0) {
    const sealed = await sealSession(transaction, incident.sessionId, now)
    if (!sealed.ok) throw new Error('The incident photographs could not be sealed.')
  }
  const [item] = await transaction.select({ itemId: rentalItems.itemId, itemType: itemTypes.name, priceListId: rentals.priceListId }).from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).innerJoin(items, eq(items.id, rentalItems.itemId)).innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.id, incident.rentalItemId))
  if (item === undefined) throw new Error('The incident has no item.')
  const [existing] = await transaction.select({ id: marks.id }).from(marks).where(eq(marks.incidentId, incidentId))
  if (box !== null && existing === undefined) {
    await transaction.insert(marks).values({ shopId: incident.shopId, itemId: item.itemId, view: box.view, region: box.region, description: incident.description.slice(0, MARK_DESCRIPTION_LENGTH), firstSeenSessionId: incident.sessionId, status: 'reported', incidentId })
  }
  const prices = await transaction.select({ code: priceEntries.code, description: priceEntries.description, category: priceEntries.category }).from(priceEntries).where(eq(priceEntries.priceListId, item.priceListId)).orderBy(asc(priceEntries.position))
  return { ok: true, hint: incident.hint, description: incident.description, language: incident.language, itemType: item.itemType, photographed: taken.length > 0, priceCodes: prices.map((price) => price.code), prices } as const
}

// What the sorting model answered, already checked against its schema by the adapter, or why there is no answer.
export type TriageAnswer = {
  readonly outcome: 'answered' | 'refused' | 'unavailable' | 'invalid'
  readonly data: (IncidentTriage & { readonly confirmation: string | null }) | null
  readonly model: string
  readonly promptVersion: string
  readonly simulated: boolean
}

// Sorts a sent report once. Code decides with the model's answer as one input (domain sortIncident); a suggested price
// is only a suggestion. The model's confirmation is kept only for small damage, and only if it names no amount, since
// no price is confirmed when it is written. Anything else the renter reads is a fixed message.
export async function sortIncidentReport(transaction: Transaction, incidentId: string, answer: TriageAnswer, now: Date) {
  const incident = await lockedIncident(transaction, incidentId)
  if (incident === undefined) return refused('not_found')
  if (incident.state !== 'reported') return { ok: true, state: incident.state, kind: incident.kind } as const
  if (incident.sentAt === null) return refused('not_sent')
  const [session] = await transaction.select({ sealedAt: captureSessions.sealedAt }).from(captureSessions).where(eq(captureSessions.id, incident.sessionId))
  const [rental] = await transaction.select({ priceListId: rentals.priceListId }).from(rentals).where(eq(rentals.id, incident.rentalId))
  if (rental === undefined) return refused('not_found')
  const prices = await transaction.select({ id: priceEntries.id, code: priceEntries.code }).from(priceEntries).where(eq(priceEntries.priceListId, rental.priceListId))
  const data = answer.outcome === 'answered' ? answer.data : null
  const triage = data === null ? null : { kind: data.kind, confidence: data.confidence, priceCode: data.priceCode }
  const sorted = sortIncident({ hint: incident.hint, description: incident.description, triage, priceCodes: prices.map((price) => price.code), photographed: session?.sealedAt != null })
  const confirmation = sorted.kind === 'small_damage' && data?.confirmation != null ? guardNumbers(data.confirmation, []) : null
  await move(transaction, incidentId, 'reported', 'triaged', {
    kind: sorted.kind, safety: sorted.safety, triageOutcome: data === null && answer.outcome === 'answered' ? 'invalid' : answer.outcome, triage, model: answer.model, promptVersion: answer.promptVersion,
    simulated: answer.simulated, confirmation, suggestedPriceEntryId: prices.find((price) => price.code === sorted.suggestedCode)?.id ?? null, sortedAt: now,
  })
  if (sorted.next !== 'triaged') await move(transaction, incidentId, 'triaged', sorted.next)
  return { ok: true, state: sorted.next, kind: sorted.kind } as const
}

// A staff member confirms which entry of the list the renter agreed to applies. Only then may the renter agree to it.
export async function confirmIncidentPrice(transaction: Transaction, incidentId: string, userId: string, priceEntryId: string, now: Date) {
  const incident = await lockedIncident(transaction, incidentId)
  if (incident === undefined) return refused('not_found')
  const staff = await claimStaff(transaction, userId, incident.currency)
  if (!staff.ok) return staff
  if (!mayConfirmOffer(incident) || incident.offeredPriceEntryId !== null) return refused('not_to_price')
  const [entry] = await transaction.select({ id: priceEntries.id }).from(priceEntries).innerJoin(rentals, eq(rentals.priceListId, priceEntries.priceListId))
    .where(and(eq(rentals.id, incident.rentalId), eq(priceEntries.id, priceEntryId), eq(priceEntries.currency, incident.currency)))
  if (entry === undefined) return refused('price_not_agreed')
  await transaction.update(incidents).set({ offeredPriceEntryId: entry.id, offerConfirmedByUserId: userId, offerConfirmedAt: now }).where(eq(incidents.id, incidentId))
  return { ok: true, rentalId: incident.rentalId } as const
}

// The renter agrees the confirmed price, after their one-time code was checked in the same transaction. The amount is
// the entry's, read here. Nothing is charged: the line waits for the return.
export async function agreeIncident(transaction: Transaction, rentalId: string, incidentId: string, now: Date) {
  const incident = await lockedIncident(transaction, incidentId, rentalId)
  if (incident === undefined) return refused('not_found')
  if (!mayAgree(incident) || incident.offeredPriceEntryId === null) return refused('not_agreeable')
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined || !OPEN_RENTAL.includes(rental.state)) return refused('not_agreeable')
  const [entry] = await transaction.select({ amountCents: priceEntries.amountCents }).from(priceEntries).where(eq(priceEntries.id, incident.offeredPriceEntryId))
  if (entry === undefined) return refused('not_agreeable')
  await move(transaction, incidentId, incident.state, 'agreed', { agreedPriceEntryId: incident.offeredPriceEntryId, agreedCents: entry.amountCents, agreedAt: now })
  return { ok: true } as const
}

// The renter would rather leave it to the return: a person decides then, through the ordinary claim.
export async function leaveIncidentForReturn(transaction: Transaction, rentalId: string, incidentId: string) {
  const incident = await lockedIncident(transaction, incidentId, rentalId)
  if (incident === undefined) return refused('not_found')
  if (incident.state !== 'triaged') return refused('not_agreeable')
  await move(transaction, incidentId, 'triaged', 'awaiting_staff')
  return { ok: true } as const
}

const clip = (text: string) => text.trim().slice(0, THEFT_FIELD_LENGTH)

// The fixed steps of a theft or loss, in the renter's words, given once while the report waits for a person. What the
// renter said is evidence: it is never rewritten (the database refuses it too, migration 0021).
export async function saveTheftDetails(transaction: Transaction, rentalId: string, incidentId: string, details: TheftDetails) {
  const incident = await lockedIncident(transaction, incidentId, rentalId)
  if (incident === undefined) return refused('not_found')
  if (incident.kind !== 'theft_or_loss' || incident.state !== 'awaiting_staff') return refused('not_theft')
  if (incident.theftDetails !== null) return refused('already_given')
  await transaction.update(incidents).set({ theftDetails: { where: clip(details.where), when: clip(details.when), lockAndKeys: clip(details.lockAndKeys), policeReport: clip(details.policeReport) } }).where(eq(incidents.id, incidentId))
  return { ok: true } as const
}

// The police report number, which often comes later: added once, to details given without one.
export async function addPoliceReport(transaction: Transaction, rentalId: string, incidentId: string, policeReport: string) {
  const incident = await lockedIncident(transaction, incidentId, rentalId)
  if (incident === undefined) return refused('not_found')
  if (incident.kind !== 'theft_or_loss') return refused('not_theft')
  if (incident.theftDetails === null) return refused('no_details')
  if (incident.theftDetails.policeReport !== '') return refused('already_given')
  if (clip(policeReport) === '') return refused('police_report_invalid')
  await transaction.update(incidents).set({ theftDetails: { ...incident.theftDetails, policeReport: clip(policeReport) } }).where(eq(incidents.id, incidentId))
  return { ok: true } as const
}

// Staff take a waiting report on as the shop's matter: a fault, which no claim line can come from.
export async function makeShopMatter(transaction: Transaction, incidentId: string) {
  const incident = await lockedIncident(transaction, incidentId)
  if (incident === undefined) return refused('not_found')
  if (!mayMakeShopMatter(incident)) return refused('not_waiting')
  await move(transaction, incidentId, incident.state, 'shop_matter')
  return { ok: true, rentalId: incident.rentalId } as const
}

// What staff are told at once, and whom: the shop's owners and managers, each in their language.
export async function incidentAlert(transaction: Transaction, incidentId: string) {
  const [row] = await transaction.select({ id: incidents.id, rentalId: incidents.rentalId, kind: incidents.kind, state: incidents.state, safety: incidents.safety, itemLabel: items.label, shopName: shops.name })
    .from(incidents).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId)).innerJoin(shops, eq(shops.id, incidents.shopId))
    .where(eq(incidents.id, incidentId))
  if (row === undefined) return undefined
  const recipients = await transaction.select({ email: users.email, language: users.language }).from(staffRoles).innerJoin(users, eq(users.id, staffRoles.userId)).where(inArray(staffRoles.role, ['owner', 'manager']))
  return { ...row, recipients }
}

export async function markIncidentAlerted(transaction: Transaction, incidentId: string, now: Date): Promise<void> {
  await transaction.update(incidents).set({ staffAlertedAt: now }).where(and(eq(incidents.id, incidentId), isNull(incidents.staffAlertedAt)))
}

type PriceView = { readonly id: string; readonly description: string; readonly amountCents: number }

async function priceView(transaction: Transaction, priceEntryId: string | null): Promise<PriceView | null> {
  if (priceEntryId === null) return null
  const [entry] = await transaction.select({ id: priceEntries.id, description: priceEntries.description, amountCents: priceEntries.amountCents }).from(priceEntries).where(eq(priceEntries.id, priceEntryId))
  return entry ?? null
}

// The shop's sent reports, newest first. Waiting: those a person must act on, by confirming a price or deciding. This
// is the list a detector for incidents waiting too long reads (extensions.md section 6, Extension 1).
export async function shopIncidents(transaction: Transaction, filter: { readonly waiting: boolean }) {
  const rows = await transaction
    .select({ id: incidents.id, rentalId: incidents.rentalId, state: incidents.state, sentAt: incidents.sentAt, kind: incidents.kind, hint: incidents.hint, description: incidents.description, safety: incidents.safety, model: incidents.model, triageOutcome: incidents.triageOutcome, simulated: incidents.simulated, currency: incidents.currency, agreedCents: incidents.agreedCents, theftDetails: incidents.theftDetails, staffAlertedAt: incidents.staffAlertedAt, reportedAt: incidents.reportedAt, priceListId: rentals.priceListId, suggestedPriceEntryId: incidents.suggestedPriceEntryId, offeredPriceEntryId: incidents.offeredPriceEntryId, itemLabel: items.label, renterName: rentals.contactName })
    .from(incidents).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId)).innerJoin(rentals, eq(rentals.id, incidents.rentalId))
    // Only sent reports: one sent and not yet sorted, because the model failed mid-way, still waits for a person.
    .where(and(isNotNull(incidents.sentAt), filter.waiting ? inArray(incidents.state, ['reported', 'triaged', 'awaiting_staff']) : ne(incidents.state, 'withdrawn')))
    .orderBy(desc(incidents.reportedAt), asc(incidents.id))
  // The agreed list, for a staff member to confirm which entry applies to small damage still without a price.
  const pricesFor = async (row: (typeof rows)[number]) => (mayConfirmOffer(row) && row.offeredPriceEntryId === null
    ? transaction.select({ id: priceEntries.id, description: priceEntries.description, amountCents: priceEntries.amountCents }).from(priceEntries).where(eq(priceEntries.priceListId, row.priceListId)).orderBy(asc(priceEntries.position))
    : [])
  return Promise.all(rows.map(async (row) => {
    const { suggestedPriceEntryId, offeredPriceEntryId, ...shown } = row
    return { ...shown, suggestion: await priceView(transaction, suggestedPriceEntryId), offer: await priceView(transaction, offeredPriceEntryId), prices: await pricesFor(row) }
  }))
}

export const incidentsWaitingForStaff = (transaction: Transaction) => shopIncidents(transaction, { waiting: true })

export type ShopIncident = Awaited<ReturnType<typeof shopIncidents>>[number]

// A rental's reports, for its renter's link.
export async function rentalIncidents(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: incidents.id, state: incidents.state, kind: incidents.kind, reportedAt: incidents.reportedAt, itemLabel: items.label })
    .from(incidents).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId))
    .where(eq(incidents.rentalId, rentalId)).orderBy(desc(incidents.reportedAt), asc(incidents.id))
}

// One report as its renter sees it: never the model's suggestion, only a price a staff member confirmed.
export async function incidentForRenter(transaction: Transaction, rentalId: string, incidentId: string) {
  const [row] = await transaction
    .select({ id: incidents.id, state: incidents.state, kind: incidents.kind, hint: incidents.hint, description: incidents.description, sessionId: incidents.sessionId, confirmation: incidents.confirmation, currency: incidents.currency, agreedCents: incidents.agreedCents, theftDetails: incidents.theftDetails, simulated: incidents.simulated, reportedAt: incidents.reportedAt, sentAt: incidents.sentAt, offeredPriceEntryId: incidents.offeredPriceEntryId, itemId: items.id, itemLabel: items.label })
    .from(incidents).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId))
    .where(and(eq(incidents.id, incidentId), eq(incidents.rentalId, rentalId)))
  if (row === undefined) return undefined
  const { offeredPriceEntryId, ...rest } = row
  const offer = await priceView(transaction, offeredPriceEntryId)
  return { ...rest, offer: offer === null ? null : { description: offer.description, amountCents: offer.amountCents, currency: row.currency } }
}

export type RenterIncident = NonNullable<Awaited<ReturnType<typeof incidentForRenter>>>

// The one-time code for agreeing small damage. Only a link that may report, only for a price a staff member confirmed.
export async function issueIncidentCode(transaction: Transaction, linkId: string, incidentId: string, hash: string, now: Date) {
  const link = await liveLink(transaction, linkId, ['report_incident'], now)
  if (link === undefined) return refused('link_invalid')
  const incident = await lockedIncident(transaction, incidentId, link.rentalId)
  if (incident === undefined || !mayAgree(incident)) return refused('not_agreeable')
  return storeRenterCode(transaction, link, hash, now)
}

export type { IncidentKind }
