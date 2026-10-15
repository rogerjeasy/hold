import { money } from '@hold/domain'
import type { ItemTypeDraft } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { addItems, changeStatus, editItem, itemCatalog, itemPassport, saveItemType } from './item-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { photoPlans, priceLists, rentalItems, rentals, wearPolicies } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-15T09:00:00Z')
const eur = (cents: number) => money(cents, 'EUR')

let database: TestDatabase
let owner: Scope
let shopId: string
let other: Scope

const ebike: ItemTypeDraft = {
  name: 'City e-bike',
  category: 'e_bike',
  currency: 'EUR',
  value: eur(2400_00),
  hold: eur(300_00),
  dayRate: eur(45_00),
  accessories: [{ name: 'Charger', count: 1 }],
  views: [
    { label: 'Frame, left side', outline: 'whole_side', required: true },
    { label: 'Display', outline: 'detail', required: false },
  ],
}

const act = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)

async function newType(draft: ItemTypeDraft = ebike): Promise<string> {
  const saved = await act(owner, (transaction) => saveItemType(transaction, shopId, { draft }, NOW))
  if (!saved.ok) throw new Error(saved.reason)
  return saved.id
}

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shopId = registered.shopId
  owner = { role: 'hold_app', shopId, userId: registered.userId }
  await act(owner, (transaction) =>
    publishPriceList(transaction, shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Scuffs are wear.' }, NOW),
  )
  const second = await registerOwner(database, { subject: 'other', email: 'kim@douro.example', name: 'Kim', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'UTC' } })
  other = { role: 'hold_app', shopId: second.shopId, userId: second.userId }
})

describe('an item type', () => {
  it('is saved with its photo plan, and the catalog lists it with each view’s key', async () => {
    const typeId = await newType()
    const catalog = await act(owner, itemCatalog)
    const type = catalog.types.find((candidate) => candidate.id === typeId)
    expect(type).toMatchObject({ name: 'City e-bike', category: 'e_bike', valueCents: 2400_00, holdCents: 300_00, dayRateCents: 45_00, accessories: [{ name: 'Charger', count: 1 }] })
    expect(type?.views).toEqual([
      { key: 'frame-left-side', label: 'Frame, left side', outline: 'whole_side', required: true },
      { key: 'display', label: 'Display', outline: 'detail', required: false },
    ])
  })

  it('refuses a second type with the same name', async () => {
    const saved = await act(owner, (transaction) => saveItemType(transaction, shopId, { draft: { ...ebike, name: 'CITY E-BIKE ' } }, NOW))
    expect(saved).toEqual({ ok: false, reason: 'name_taken' })
  })

  it('saves a new photo plan when the views change, and leaves the old plan as it was', async () => {
    const typeId = await newType({ ...ebike, name: 'Cargo bike' })
    const before = await act(owner, async (transaction) => (await itemCatalog(transaction)).types.find((type) => type.id === typeId)?.photoPlanId)

    await act(owner, (transaction) => saveItemType(transaction, shopId, { id: typeId, draft: { ...ebike, name: 'Cargo bike', hold: eur(400_00) } }, NOW))
    const unchanged = await act(owner, async (transaction) => (await itemCatalog(transaction)).types.find((type) => type.id === typeId))
    expect(unchanged).toMatchObject({ holdCents: 400_00, photoPlanId: before })

    const views = [...ebike.views, { label: 'Cargo box', outline: 'top' as const, required: true }]
    await act(owner, (transaction) => saveItemType(transaction, shopId, { id: typeId, draft: { ...ebike, name: 'Cargo bike', views } }, NOW))
    const changed = await act(owner, async (transaction) => (await itemCatalog(transaction)).types.find((type) => type.id === typeId))
    expect(changed?.photoPlanId).not.toBe(before)
    expect(changed?.views).toHaveLength(3)
    const [old] = await act(owner, (transaction) => transaction.select().from(photoPlans).where(eq(photoPlans.id, before ?? '')))
    expect(old?.views).toHaveLength(2)
  })

  it('needs the shop’s currency, set by its first price list', async () => {
    const saved = await act(owner, (transaction) => saveItemType(transaction, shopId, { draft: { ...ebike, name: 'Kayak', currency: 'CHF' } }, NOW))
    expect(saved).toEqual({ ok: false, reason: 'currency_mismatch' })
  })

  it('cannot be edited from another shop', async () => {
    const typeId = await newType({ ...ebike, name: 'Tandem' })
    const saved = await act(other, (transaction) => saveItemType(transaction, other.shopId, { id: typeId, draft: ebike }, NOW))
    expect(saved).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('a photo plan', () => {
  it('cannot be changed once saved, not even by a query that passes every policy', async () => {
    await newType({ ...ebike, name: 'Gravel bike' })
    const refused = await act(owner, (transaction) => transaction.update(photoPlans).set({ name: 'changed' })).then(
      () => 'not refused',
      (error: unknown) => (error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)),
    )
    expect(refused).toMatch(/permission denied/)
  })
})

describe('items', () => {
  it('are added numbered after the type, with a size', async () => {
    const typeId = await newType({ ...ebike, name: 'Trek FX 3' })
    const added = await act(owner, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 2, size: 'M', serial: '' }, NOW))
    expect(added).toEqual({ ok: true, labels: ['Trek FX 3 1', 'Trek FX 3 2'] })
    const more = await act(owner, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 1, size: '', serial: 'WTU-88' }, NOW))
    expect(more).toEqual({ ok: true, labels: ['Trek FX 3 3'] })

    const catalog = await act(owner, itemCatalog)
    const items = catalog.items.filter((item) => item.itemTypeId === typeId)
    expect(items.map((item) => [item.label, item.size, item.serial, item.standing])).toEqual([
      ['Trek FX 3 1', 'M', null, 'available'],
      ['Trek FX 3 2', 'M', null, 'available'],
      ['Trek FX 3 3', null, 'WTU-88', 'available'],
    ])
  })

  it('are not added to another shop’s type', async () => {
    const typeId = await newType({ ...ebike, name: 'E-cargo' })
    expect(await act(other, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 1, size: '', serial: '' }, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })

  it('keep their labels apart', async () => {
    const typeId = await newType({ ...ebike, name: 'Hybrid' })
    const added = await act(owner, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 2, size: '', serial: '' }, NOW))
    const items = (await act(owner, itemCatalog)).items.filter((item) => item.itemTypeId === typeId)
    const [first, second] = items
    if (!added.ok || first === undefined || second === undefined) throw new Error('No items.')
    expect(await act(owner, (transaction) => editItem(transaction, second.id, { label: 'hybrid 1', size: 'L', serial: '' }))).toEqual({ ok: false, reason: 'label_taken' })
    expect(await act(owner, (transaction) => editItem(transaction, second.id, { label: 'Hybrid blue', size: 'L', serial: 'H-2' }))).toEqual({ ok: true })
    expect((await act(owner, itemCatalog)).items.find((item) => item.id === second.id)).toMatchObject({ label: 'Hybrid blue', size: 'L', serial: 'H-2' })
  })
})

async function rentItem(itemId: string, state: 'booked' | 'out' | 'closed', startsAt: Date, renterId?: string) {
  const [list] = await database.select().from(priceLists).where(eq(priceLists.shopId, shopId))
  const [wear] = await database.select().from(wearPolicies).where(eq(wearPolicies.shopId, shopId))
  if (list === undefined || wear === undefined) throw new Error('No terms.')
  const [rental] = await database
    .insert(rentals)
    .values({ shopId, renterId, startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), currency: 'EUR', feeCents: 45_00, priceListId: list.id, wearPolicyId: wear.id, state })
    .returning({ id: rentals.id })
  if (rental === undefined) throw new Error('No rental.')
  await database.insert(rentalItems).values({ shopId, rentalId: rental.id, itemId })
  return rental.id
}

describe('where an item stands, and its status', () => {
  async function oneItem(name: string) {
    const typeId = await newType({ ...ebike, name })
    await act(owner, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 1, size: '', serial: '' }, NOW))
    const item = (await act(owner, itemCatalog)).items.find((candidate) => candidate.itemTypeId === typeId)
    if (item === undefined) throw new Error('No item.')
    return item.id
  }
  const standing = async (itemId: string) => (await act(owner, itemCatalog)).items.find((item) => item.id === itemId)?.standing

  it('is out while its rental is out, and in the workshop is refused then', async () => {
    const itemId = await oneItem('Tandem kayak')
    await rentItem(itemId, 'closed', new Date('2026-10-01T09:00:00Z'))
    await rentItem(itemId, 'out', new Date('2026-10-14T09:00:00Z'))
    expect(await standing(itemId)).toBe('out')
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'in_repair', note: 'Brakes' }, NOW))).toEqual({ ok: false, reason: 'with_renter' })
  })

  it('goes to repair with a note and comes back', async () => {
    const itemId = await oneItem('Gravel')
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'in_repair', note: 'Bent rear wheel' }, NOW))).toEqual({ ok: true })
    expect((await act(owner, itemCatalog)).items.find((item) => item.id === itemId)).toMatchObject({ standing: 'in_repair', statusNote: 'Bent rear wheel', statusSince: NOW })
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'in_service', note: '' }, NOW))).toEqual({ ok: true })
    expect(await standing(itemId)).toBe('available')
  })

  it('cannot be retired while booked, and is never brought back once retired', async () => {
    const itemId = await oneItem('Child seat')
    const rentalId = await rentItem(itemId, 'booked', new Date('2026-10-20T09:00:00Z'))
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'retired', note: '' }, NOW))).toEqual({ ok: false, reason: 'rental_under_way' })
    await database.update(rentals).set({ state: 'cancelled' }).where(eq(rentals.id, rentalId))
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'retired', note: 'Sold' }, NOW))).toEqual({ ok: true })
    expect(await act(owner, (transaction) => changeStatus(transaction, itemId, { to: 'in_service', note: '' }, NOW))).toEqual({ ok: false, reason: 'transition_not_allowed' })
  })

  it('is not changed from another shop', async () => {
    const itemId = await oneItem('SUP board')
    expect(await act(other, (transaction) => changeStatus(transaction, itemId, { to: 'in_repair', note: '' }, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('the item passport', () => {
  it('lists the item’s rentals, newest first', async () => {
    const typeId = await newType({ ...ebike, name: 'E-mountain bike' })
    await act(owner, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 1, size: 'L', serial: 'EMTB-1' }, NOW))
    const item = (await act(owner, itemCatalog)).items.find((candidate) => candidate.itemTypeId === typeId)
    if (item === undefined) throw new Error('No item.')
    const first = await rentItem(item.id, 'closed', new Date('2026-10-01T09:00:00Z'))
    const second = await rentItem(item.id, 'out', new Date('2026-10-14T09:00:00Z'))

    const passport = await act(owner, (transaction) => itemPassport(transaction, item.id))
    expect(passport).toMatchObject({ item: { label: 'E-mountain bike 1', size: 'L', serial: 'EMTB-1', standing: 'out' }, type: { name: 'E-mountain bike' }, marks: [], sessions: [] })
    expect(passport?.rentals.map((rental) => rental.id)).toEqual([second, first])
  })

  it('is not shown to another shop', async () => {
    const item = (await act(owner, itemCatalog)).items[0]
    expect(await act(other, (transaction) => itemPassport(transaction, item?.id ?? ''))).toBeUndefined()
  })
})
