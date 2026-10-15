// @vitest-environment node
import { acceptInvitation, createInvitation, inShop, itemCatalog, registerOwner } from '@hold/db'
import type { StaffRole } from '@hold/domain'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const items = await import('./actions')
const shop = await import('@/features/shop/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@ribeira.example'
let shopId: string
let ownerId: string

const ebike = {
  itemTypeId: '',
  name: 'City e-bike',
  category: 'e_bike',
  value: '2400',
  hold: '300',
  dayRate: '45',
  accessoryName: ['Charger', 'Lock'],
  accessoryCount: ['1', '1'],
  viewLabel: ['Frame, left side', 'Display'],
  viewOutline: ['whole_side', 'detail'],
  viewRequired: ['yes', 'no'],
  locale: 'en',
}

async function invite(email: string, role: StaffRole) {
  const { database } = await getServices()
  const { token } = await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const subject = await signIn(jar, email, 'passkey')
  await acceptInvitation(database, { token, subject, email, name: role, language: 'en' }, new Date())
}

const catalog = async () => {
  const { database } = await getServices()
  return inShop(database, { role: 'hold_app', shopId, userId: ownerId }, itemCatalog)
}

async function typeId(name: string) {
  const type = (await catalog()).types.find((candidate) => candidate.name === name)
  if (type === undefined) throw new Error(`No type ${name}.`)
  return type.id
}

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  const registered = await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shopId = registered.shopId
  ownerId = registered.userId
  await invite('jonas@ribeira.example', 'counter_staff')
  await invite('reader@ribeira.example', 'read_only')
})

beforeEach(() => {
  jar.clear()
})

describe('saving an item type', () => {
  it('waits for the shop’s currency, which its first price list sets', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await items.saveItemType(null, form(ebike))).toEqual({ ok: false, failure: 'refused', reason: 'currency_unset' })
    const prices = { currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }
    expect(await shop.publishPrices(null, form(prices))).toMatchObject({ ok: true })
  })

  it('needs the owner’s passkey', async () => {
    await signIn(jar, OWNER, 'email_code')
    expect(await items.saveItemType(null, form(ebike))).toEqual({ ok: false, failure: 'passkey_needed' })
  })

  it('is refused to counter staff and to read-only members', async () => {
    await signIn(jar, 'jonas@ribeira.example', 'passkey')
    expect(await items.saveItemType(null, form(ebike))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, 'reader@ribeira.example', 'passkey')
    expect(await items.saveItemType(null, form(ebike))).toEqual({ ok: false, failure: 'role' })
  })

  it('saves the type with its kit and photo plan for the owner', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await items.saveItemType(null, form(ebike))).toMatchObject({ ok: true })
    expect((await catalog()).types.find((type) => type.name === 'City e-bike')).toMatchObject({
      valueCents: 2400_00,
      holdCents: 300_00,
      dayRateCents: 45_00,
      accessories: [
        { name: 'Charger', count: 1 },
        { name: 'Lock', count: 1 },
      ],
      views: [
        { key: 'frame-left-side', label: 'Frame, left side', outline: 'whole_side', required: true },
        { key: 'display', label: 'Display', outline: 'detail', required: false },
      ],
    })
  })

  it('names the first problem the domain finds', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await items.saveItemType(null, form({ ...ebike, name: 'Kayak', hold: '3000' }))).toEqual({ ok: false, failure: 'refused', reason: 'hold_above_value' })
    expect(await items.saveItemType(null, form({ ...ebike, name: 'Kayak', viewRequired: ['no', 'no'] }))).toEqual({ ok: false, failure: 'refused', reason: 'no_required_view' })
    expect(await items.saveItemType(null, form({ ...ebike, name: 'Kayak', dayRate: '4,5x' }))).toEqual({ ok: false, failure: 'refused', reason: 'day_rate_invalid' })
  })

  it('takes a type with no kit', async () => {
    await signIn(jar, OWNER, 'passkey')
    const bare = Object.fromEntries(Object.entries(ebike).filter(([field]) => !field.startsWith('accessory')))
    expect(await items.saveItemType(null, form({ ...bare, name: 'Gravel bike', category: 'bike' }))).toMatchObject({ ok: true })
  })

  it('refuses rows that do not line up', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await items.saveItemType(null, form({ ...ebike, name: 'Kayak', viewOutline: ['whole_side'] }))).toEqual({ ok: false, failure: 'refused', reason: 'rows_mismatched' })
  })
})

describe('adding and editing items', () => {
  it('adds numbered items for the owner with no passkey needed', async () => {
    await signIn(jar, OWNER, 'email_code')
    const added = await items.addItems(null, form({ itemTypeId: await typeId('City e-bike'), count: '3', size: 'M', serial: '', locale: 'en' }))
    expect(added).toEqual({ ok: true, value: { labels: ['City e-bike 1', 'City e-bike 2', 'City e-bike 3'] } })
  })

  it('is refused to counter staff', async () => {
    await signIn(jar, 'jonas@ribeira.example', 'passkey')
    expect(await items.addItems(null, form({ itemTypeId: await typeId('City e-bike'), count: '1', size: '', serial: '', locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
  })

  it('renames an item, and refuses a label already in use', async () => {
    await signIn(jar, OWNER, 'email_code')
    const [first, second] = (await catalog()).items
    if (first === undefined || second === undefined) throw new Error('No items.')
    expect(await items.editItem(null, form({ itemId: second.id, label: first.label, size: 'L', serial: '', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'label_taken' })
    expect(await items.editItem(null, form({ itemId: second.id, label: 'Blue e-bike', size: 'L', serial: 'WTU-1', locale: 'en' }))).toEqual({ ok: true, value: {} })
  })
})

describe('changing an item’s status', () => {
  it('lets counter staff send an item to repair and bring it back', async () => {
    const [item] = (await catalog()).items
    if (item === undefined) throw new Error('No item.')
    await signIn(jar, 'jonas@ribeira.example', 'email_code')
    expect(await items.changeItemStatus(null, form({ itemId: item.id, status: 'in_repair', note: 'Flat tyre', locale: 'en' }))).toEqual({ ok: true, value: {} })
    expect(await items.changeItemStatus(null, form({ itemId: item.id, status: 'in_service', note: '', locale: 'en' }))).toEqual({ ok: true, value: {} })
  })

  it('is refused to read-only members', async () => {
    const [item] = (await catalog()).items
    await signIn(jar, 'reader@ribeira.example', 'passkey')
    expect(await items.changeItemStatus(null, form({ itemId: item?.id ?? '', status: 'in_repair', note: '', locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
  })

  it('leaves retiring to the owner and managers', async () => {
    const [item] = (await catalog()).items
    await signIn(jar, 'jonas@ribeira.example', 'passkey')
    expect(await items.changeItemStatus(null, form({ itemId: item?.id ?? '', status: 'retired', note: 'Sold', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'role_may_not_retire' })
  })
})

describe('another shop', () => {
  it('cannot add items to this shop’s type', async () => {
    const { database } = await getServices()
    const subject = await signIn(jar, 'kim@douro.example', 'passkey')
    await registerOwner(database, { subject, email: 'kim@douro.example', name: 'Kim', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'UTC' } })
    expect(await items.addItems(null, form({ itemTypeId: await typeId('City e-bike'), count: '1', size: '', serial: '', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_found' })
  })
})
