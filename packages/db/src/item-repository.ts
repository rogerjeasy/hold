import { bindingRental, changeItemStatus, checkItem, ITEM_LIMITS, itemStanding, nextItemLabels, viewKeys } from '@hold/domain'
import type { Accessory, ClaimState, ItemCategory, ItemDraft, ItemStanding, ItemStatus, ItemTypeDraft, RentalState } from '@hold/domain'
import { and, asc, count, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm'
import type { PhotoPlanView } from './schema/index.ts'
import { captureSessions, claims, items, itemTypes, MARK_STATUSES, marks, photoPlans, photos, rentalItems, rentals, renters, shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The shop's item types and items (architecture.md section 6.3). Every function runs inside inShop, so row-level
// security hides another shop's rows: an id from elsewhere reads as not found.

export type CatalogType = {
  readonly id: string
  readonly name: string
  readonly category: ItemCategory
  readonly currency: string
  readonly valueCents: number
  readonly holdCents: number
  readonly dayRateCents: number
  readonly accessories: readonly Accessory[]
  readonly photoPlanId: string
  readonly views: readonly PhotoPlanView[]
  readonly simulated: boolean
}

// The rental that decides where an item stands, when one still needs it.
export type BindingRental = { readonly id: string; readonly state: RentalState; readonly startsAt: Date; readonly endsAt: Date }

export type CatalogItem = {
  readonly id: string
  readonly itemTypeId: string
  readonly label: string
  readonly size: string | null
  readonly serial: string | null
  readonly status: ItemStatus
  readonly statusNote: string | null
  readonly statusSince: Date | null
  readonly standing: ItemStanding
  readonly rental: BindingRental | undefined
  readonly simulated: boolean
}

export type ItemCatalog = { readonly types: readonly CatalogType[]; readonly items: readonly CatalogItem[] }

const FINISHED: RentalState[] = ['closed', 'cancelled', 'abandoned']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const typeColumns = {
  id: itemTypes.id,
  name: itemTypes.name,
  category: itemTypes.category,
  currency: itemTypes.currency,
  valueCents: itemTypes.valueCents,
  holdCents: itemTypes.holdCents,
  dayRateCents: itemTypes.dayRateCents,
  accessories: itemTypes.accessories,
  photoPlanId: itemTypes.photoPlanId,
  views: photoPlans.views,
  simulated: itemTypes.simulated,
}

const itemColumns = {
  id: items.id,
  itemTypeId: items.itemTypeId,
  label: items.label,
  size: items.size,
  serial: items.serial,
  status: items.status,
  statusNote: items.statusNote,
  statusSince: items.statusSince,
  simulated: items.simulated,
}

const byLabel = (a: { readonly label: string }, b: { readonly label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })

// The rentals that still need each item, earliest first, read once for the whole list.
async function bindingRentals(transaction: Transaction, itemIds: readonly string[]): Promise<ReadonlyMap<string, BindingRental>> {
  if (itemIds.length === 0) return new Map()
  const rows = await transaction
    .select({ itemId: rentalItems.itemId, id: rentals.id, state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(inArray(rentalItems.itemId, [...itemIds]), notInArray(rentals.state, FINISHED)))
    .orderBy(asc(rentals.startsAt))
  const byItem = new Map<string, BindingRental[]>()
  for (const { itemId, ...rental } of rows) byItem.set(itemId, [...(byItem.get(itemId) ?? []), rental])
  const binding = new Map<string, BindingRental>()
  for (const [itemId, open] of byItem) {
    const state = bindingRental(open.map((rental) => rental.state))
    const rental = open.find((candidate) => candidate.state === state)
    if (rental !== undefined) binding.set(itemId, rental)
  }
  return binding
}

function withStanding(row: Omit<CatalogItem, 'standing' | 'rental'>, rental: BindingRental | undefined): CatalogItem {
  return { ...row, rental, standing: itemStanding(row.status, rental?.state) }
}

export async function itemCatalog(transaction: Transaction): Promise<ItemCatalog> {
  const types = await transaction.select(typeColumns).from(itemTypes).innerJoin(photoPlans, eq(photoPlans.id, itemTypes.photoPlanId)).orderBy(asc(itemTypes.name))
  const rows = await transaction.select(itemColumns).from(items)
  const rentalsByItem = await bindingRentals(
    transaction,
    rows.map((row) => row.id),
  )
  return { types, items: rows.map((row) => withStanding(row, rentalsByItem.get(row.id))).sort(byLabel) }
}

export type SaveItemTypeResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'not_found' | 'name_taken' | 'currency_unset' | 'currency_mismatch' }

function planViews(draft: ItemTypeDraft): readonly PhotoPlanView[] {
  const keys = viewKeys(draft.views)
  return draft.views.map((view, index) => ({ key: keys[index] ?? `view-${String(index + 1)}`, label: view.label.trim(), outline: view.outline, required: view.required }))
}

const sameViews = (a: readonly PhotoPlanView[], b: readonly PhotoPlanView[]) => JSON.stringify(a) === JSON.stringify(b)

// Creates an item type, or edits one when `id` is given. The draft has passed checkItemType. An edit that changes the
// views saves a new photo plan; the old plan stays as it was, for the sessions taken with it.
export async function saveItemType(transaction: Transaction, shopId: string, input: { readonly id?: string; readonly draft: ItemTypeDraft }, now: Date): Promise<SaveItemTypeResult> {
  const { draft } = input
  const existing =
    input.id === undefined || !UUID.test(input.id)
      ? undefined
      : (await transaction.select({ photoPlanId: itemTypes.photoPlanId, views: photoPlans.views }).from(itemTypes).innerJoin(photoPlans, eq(photoPlans.id, itemTypes.photoPlanId)).where(eq(itemTypes.id, input.id)))[0]
  if (input.id !== undefined && existing === undefined) return { ok: false, reason: 'not_found' }

  const [shop] = await transaction.select({ currency: shops.currency }).from(shops).where(eq(shops.id, shopId))
  if (shop?.currency == null) return { ok: false, reason: 'currency_unset' }
  if (shop.currency !== draft.currency) return { ok: false, reason: 'currency_mismatch' }

  const name = draft.name.trim()
  const sameName = and(sql`lower(${itemTypes.name}) = lower(${name})`, eq(itemTypes.simulated, false), input.id === undefined ? undefined : ne(itemTypes.id, input.id))
  const [taken] = await transaction.select({ id: itemTypes.id }).from(itemTypes).where(sameName)
  if (taken !== undefined) return { ok: false, reason: 'name_taken' }

  const views = planViews(draft)
  let photoPlanId = existing?.photoPlanId
  if (existing === undefined || !sameViews(existing.views, views)) {
    const [plan] = await transaction.insert(photoPlans).values({ shopId, name, views, createdAt: now }).returning({ id: photoPlans.id })
    if (plan === undefined) throw new Error('The photo plan was not saved.')
    photoPlanId = plan.id
  }
  if (photoPlanId === undefined) throw new Error('The item type has no photo plan.')

  const values = {
    name,
    category: draft.category,
    currency: draft.currency,
    valueCents: draft.value.cents,
    holdCents: draft.hold.cents,
    dayRateCents: draft.dayRate.cents,
    accessories: draft.accessories.map((accessory) => ({ name: accessory.name.trim(), count: accessory.count })),
    photoPlanId,
  }
  if (input.id !== undefined) {
    await transaction.update(itemTypes).set(values).where(eq(itemTypes.id, input.id))
    return { ok: true, id: input.id }
  }
  const [created] = await transaction
    .insert(itemTypes)
    .values({ ...values, shopId, createdAt: now })
    .returning({ id: itemTypes.id })
  if (created === undefined) throw new Error('The item type was not saved.')
  return { ok: true, id: created.id }
}

export type NewItems = { readonly itemTypeId: string; readonly count: number; readonly size: string; readonly serial: string }

export type AddItemsResult = { readonly ok: true; readonly labels: readonly string[] } | { readonly ok: false; readonly reason: 'not_found' | 'count_invalid' | 'serial_needs_one' | 'invalid' }

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim())

// Adds `count` items of one type, numbered on from the labels already in use. A serial belongs to one item only.
export async function addItems(transaction: Transaction, input: NewItems, now: Date): Promise<AddItemsResult> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > ITEM_LIMITS.addAtOnce) return { ok: false, reason: 'count_invalid' }
  if (input.serial.trim() !== '' && input.count !== 1) return { ok: false, reason: 'serial_needs_one' }
  if (!UUID.test(input.itemTypeId)) return { ok: false, reason: 'not_found' }
  const [type] = await transaction.select({ shopId: itemTypes.shopId, name: itemTypes.name }).from(itemTypes).where(eq(itemTypes.id, input.itemTypeId))
  if (type === undefined) return { ok: false, reason: 'not_found' }
  const existing = await transaction.select({ label: items.label }).from(items).where(eq(items.simulated, false))
  const labels = nextItemLabels(
    type.name,
    existing.map((row) => row.label),
    input.count,
  )
  if (labels.some((label) => checkItem({ label, size: input.size, serial: input.serial }).length > 0)) return { ok: false, reason: 'invalid' }
  await transaction.insert(items).values(
    labels.map((label) => ({ shopId: type.shopId, itemTypeId: input.itemTypeId, label, size: textOrNull(input.size), serial: textOrNull(input.serial), createdAt: now })),
  )
  return { ok: true, labels }
}

export type EditItemResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'label_taken' | 'invalid' }

export async function editItem(transaction: Transaction, itemId: string, draft: ItemDraft): Promise<EditItemResult> {
  if (!UUID.test(itemId)) return { ok: false, reason: 'not_found' }
  if (checkItem(draft).length > 0) return { ok: false, reason: 'invalid' }
  const [item] = await transaction.select({ simulated: items.simulated }).from(items).where(eq(items.id, itemId))
  if (item === undefined) return { ok: false, reason: 'not_found' }
  const label = draft.label.trim()
  const [taken] = await transaction
    .select({ id: items.id })
    .from(items)
    .where(and(sql`lower(${items.label}) = lower(${label})`, eq(items.simulated, item.simulated), ne(items.id, itemId)))
  if (taken !== undefined) return { ok: false, reason: 'label_taken' }
  await transaction
    .update(items)
    .set({ label, size: textOrNull(draft.size), serial: textOrNull(draft.serial) })
    .where(eq(items.id, itemId))
  return { ok: true }
}

export type ChangeStatusResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'transition_not_allowed' | 'with_renter' | 'rental_under_way' }

// Sends an item to repair, brings it back into service, or retires it, as the domain allows given its rentals.
export async function changeStatus(transaction: Transaction, itemId: string, change: { readonly to: ItemStatus; readonly note: string }, now: Date): Promise<ChangeStatusResult> {
  if (!UUID.test(itemId)) return { ok: false, reason: 'not_found' }
  const [item] = await transaction.select({ status: items.status }).from(items).where(eq(items.id, itemId))
  if (item === undefined) return { ok: false, reason: 'not_found' }
  const open = await transaction
    .select({ state: rentals.state })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(eq(rentalItems.itemId, itemId))
  const changed = changeItemStatus({ from: item.status, to: change.to, rental: bindingRental(open.map((rental) => rental.state)) })
  if (!changed.ok) return { ok: false, reason: changed.error.kind }
  await transaction
    .update(items)
    .set({ status: change.to, statusNote: change.to === 'in_service' ? null : textOrNull(change.note), statusSince: now })
    .where(eq(items.id, itemId))
  return { ok: true }
}

export type PassportRental = {
  readonly id: string
  readonly state: RentalState
  readonly startsAt: Date
  readonly endsAt: Date
  readonly renterName: string | null
  readonly simulated: boolean
  readonly claim: { readonly state: ClaimState; readonly totalCents: number; readonly currency: string } | undefined
}

export type PassportMark = { readonly id: string; readonly view: string; readonly description: string; readonly status: (typeof MARK_STATUSES)[number]; readonly firstSeenAt: Date; readonly closedAt: Date | null }

export type PassportSession = {
  readonly id: string
  readonly kind: string
  readonly startedAt: Date
  readonly sealedAt: Date | null
  readonly manifestFingerprint: string | null
  readonly previousManifestFingerprint: string | null
  readonly photographs: number
}

export type ItemPassport = {
  readonly item: CatalogItem
  readonly type: CatalogType
  readonly rentals: readonly PassportRental[]
  readonly marks: readonly PassportMark[]
  readonly sessions: readonly PassportSession[]
}

// One item's record: its rentals, its known marks and its chain of sealed photo sessions (section 9.4).
export async function itemPassport(transaction: Transaction, itemId: string): Promise<ItemPassport | undefined> {
  if (!UUID.test(itemId)) return undefined
  const [row] = await transaction.select(itemColumns).from(items).where(eq(items.id, itemId))
  if (row === undefined) return undefined
  const [type] = await transaction.select(typeColumns).from(itemTypes).innerJoin(photoPlans, eq(photoPlans.id, itemTypes.photoPlanId)).where(eq(itemTypes.id, row.itemTypeId))
  if (type === undefined) return undefined

  const history = await transaction
    .select({
      id: rentals.id,
      state: rentals.state,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      renterName: renters.name,
      simulated: rentals.simulated,
      claimState: claims.state,
      claimTotalCents: claims.totalCents,
      currency: rentals.currency,
    })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .leftJoin(claims, eq(claims.rentalId, rentals.id))
    .where(eq(rentalItems.itemId, itemId))
    .orderBy(desc(rentals.startsAt))
  const binding = await bindingRentals(transaction, [itemId])

  const knownMarks = await transaction
    .select({ id: marks.id, view: marks.view, description: marks.description, status: marks.status, firstSeenAt: captureSessions.startedAt, closedAt: marks.closedAt })
    .from(marks)
    .innerJoin(captureSessions, eq(captureSessions.id, marks.firstSeenSessionId))
    .where(eq(marks.itemId, itemId))
    .orderBy(asc(captureSessions.startedAt))

  const sessions = await transaction
    .select({
      id: captureSessions.id,
      kind: captureSessions.kind,
      startedAt: captureSessions.startedAt,
      sealedAt: captureSessions.sealedAt,
      manifestFingerprint: captureSessions.manifestFingerprint,
      previousManifestFingerprint: captureSessions.previousManifestFingerprint,
      photographs: count(photos.id),
    })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .leftJoin(photos, eq(photos.sessionId, captureSessions.id))
    .where(eq(rentalItems.itemId, itemId))
    .groupBy(captureSessions.id)
    .orderBy(desc(captureSessions.startedAt))

  return {
    item: withStanding(row, binding.get(itemId)),
    type,
    rentals: history.map(({ claimState, claimTotalCents, currency, ...rental }) => ({
      ...rental,
      claim: claimState === null || claimTotalCents === null ? undefined : { state: claimState, totalCents: claimTotalCents, currency },
    })),
    marks: knownMarks,
    sessions,
  }
}
