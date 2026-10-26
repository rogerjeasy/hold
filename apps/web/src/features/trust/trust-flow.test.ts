// @vitest-environment node
import { acceptInvitation, authorizations, createInvitation, holds, inShop, itemCatalog, moneyEvents, registerOwner, rentalOutcomes, rentals, trustLadders } from '@hold/db'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.7' }
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': forwarded.value })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`) }))

const trust = await import('./actions')
const renterTrust = await import('./renter-actions')
const rentalActions = await import('@/features/rentals/actions')
const renter = await import('@/features/renter/actions')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 60_000 })

// The simulated PayPal names every renter as this one payer, so one person rents at both shops.
const PAYER = 'FAKEPAYER0001'
const OWNER_A = 'owner@trust-a.example'
const OWNER_B = 'owner@trust-b.example'
const READER = 'reader@trust-b.example'
const ladder = { history: 'network', windowMonths: '24', minimumFee: '0', minimumHours: '0', cleanReturns: ['3', '5'], share: ['75', '50'], largestValue: ['3000', '3000'], savedMethod: ['no', 'no'], locale: 'en' }

type OpenShop = { readonly shopId: string; readonly typeId: string; readonly owner: string }
let shopA: OpenShop
let shopB: OpenShop

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
const tokenOf = (url: string) => url.split('/r/')[1]?.split(/[/?]/)[0] ?? ''
const orderOf = (approvalUrl: string) => approvalUrl.split('/').at(-1) ?? ''

async function openShop(owner: string, name: string): Promise<OpenShop> {
  const { database } = await getServices()
  const subject = await signIn(jar, owner, 'passkey')
  const registered = await registerOwner(database, { subject, email: owner, name: 'Ana', language: 'en', shop: { name, timeZone: 'UTC' } })
  expect(await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  const type = { itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }
  expect(await items.saveItemType(null, form(type))).toMatchObject({ ok: true })
  const typeId = (await inShop(database, { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: typeId, count: '9', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  return { shopId: registered.shopId, typeId, owner }
}

// A rental at the shop whose fee the renter paid through their link.
let nextFrom = 0
async function paidRental(at: OpenShop): Promise<{ rentalId: string; token: string }> {
  await signIn(jar, at.owner, 'email_code')
  nextFrom += 2
  const booked = await rentalActions.bookRental(null, form({ startsAt: day(nextFrom), endsAt: day(nextFrom + 1), itemTypeId: at.typeId, count: '1', contactName: 'Priya', contactEmail: '', language: 'en', locale: 'en' }))
  if (!booked.ok) throw new Error(JSON.stringify(booked))
  const shown = await rentalActions.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))
  if (!shown.ok) throw new Error(JSON.stringify(shown))
  jar.clear()
  const token = tokenOf(shown.value.url)
  const started = await renter.payFee(null, form({ token, locale: 'en' }))
  if (!started.ok) throw new Error(JSON.stringify(started))
  ;(await getServices()).simulatedPayPal?.approveOrder(orderOf(started.value.approvalUrl))
  await renter.confirmFee(null, form({ token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))
  return { rentalId: booked.value.rentalId, token }
}

// Staff ask for the hold at pickup: the amount reserved is what the shop's ladder gives this renter.
async function heldAtPickup(at: OpenShop): Promise<{ rentalId: string; token: string; reservedCents: number }> {
  const { rentalId } = await paidRental(at)
  await signIn(jar, at.owner, 'email_code')
  const asked = await rentalActions.askForHold(null, form({ rentalId, locale: 'en' }))
  if (!asked.ok) throw new Error(JSON.stringify(asked))
  jar.clear()
  const { database } = await getServices()
  const hold = (await database.select().from(holds)).find((row) => row.rentalId === rentalId)
  return { rentalId, token: tokenOf(asked.value.url), reservedCents: hold?.reservedCents ?? 0 }
}

beforeAll(async () => {
  shopA = await openShop(OWNER_A, 'Ribeira Bikes')
  shopB = await openShop(OWNER_B, 'Douro Rides')
  // Five rentals at shop A that closed in good condition, as closing them writes their outcomes.
  const { database, trust: services } = await getServices()
  for (let index = 0; index < 5; index += 1) {
    const { rentalId } = await paidRental(shopA)
    await database.insert(rentalOutcomes).values({ shopId: shopA.shopId, rentalId, renterKey: services.renterKey(PAYER), itemCategory: 'e_bike', closedAt: new Date(Date.now() - (index + 1) * 20 * 86_400_000), outcome: 'clean', counts: true })
  }
  const owner = await signIn(jar, OWNER_B, 'passkey')
  expect(await trust.publishLadder(null, form(ladder))).toEqual({ ok: true, value: { version: 1 } })
  const ownerId = (await database.select().from(trustLadders)).find((row) => row.shopId === shopB.shopId)?.publishedByUserId ?? ''
  const { token } = await inShop(database, { role: 'hold_app', shopId: shopB.shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId: shopB.shopId, invitedByUserId: ownerId, email: READER, role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const reader = await signIn(jar, READER, 'email_code')
  await acceptInvitation(database, { token, subject: reader, email: READER, name: 'Reader', language: 'en' }, new Date())
  expect(owner).toBeTruthy()
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('publishing a trust ladder', () => {
  it('needs the owner, confirmed with a passkey', async () => {
    await signIn(jar, OWNER_B, 'email_code')
    expect(await trust.publishLadder(null, form(ladder))).toEqual({ ok: false, failure: 'passkey_needed' })
    await signIn(jar, READER, 'email_code')
    expect(await trust.publishLadder(null, form(ladder))).toEqual({ ok: false, failure: 'role' })
  })

  it('refuses a ladder that breaks its rules, naming the rung', async () => {
    await signIn(jar, OWNER_B, 'passkey')
    expect(await trust.publishLadder(null, form({ ...ladder, share: ['50', '75'] }))).toEqual({ ok: false, failure: 'refused', reason: 'share_not_falling:1' })
  })

  it('replays a candidate over the shop’s past rentals, for the owner or a manager only', async () => {
    await signIn(jar, OWNER_B, 'email_code')
    expect(await trust.replayLadder(null, form(ladder))).toMatchObject({ ok: true, value: { rentals: expect.any(Number) as number, lowered: 0, loweredByCents: 0, claimsAboveLoweredHold: 0, uncoveredCents: 0 } })
    await signIn(jar, READER, 'email_code')
    expect(await trust.replayLadder(null, form(ladder))).toEqual({ ok: false, failure: 'role' })
  })
})

describe('the hold at another Hold shop', () => {
  it('is the ordinary hold while the renter has not consented (X2.2)', async () => {
    expect((await heldAtPickup(shopB)).reservedCents).toBe(300_00)
  })

  it('is the ladder’s amount once the renter consents, the authorization PayPal reports is for it, and the rental keeps the version and rung (X2.1)', async () => {
    const { token: atA } = await paidRental(shopA)
    expect(await renterTrust.answerConsent(null, form({ token: atA, consent: 'yes', locale: 'en' }))).toEqual({ ok: true, value: { consented: true } })
    const { rentalId, token, reservedCents } = await heldAtPickup(shopB)
    expect(reservedCents).toBe(150_00)
    const started = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    const orderId = orderOf(started.value.approvalUrl)
    const { simulatedPayPal, database } = await getServices()
    expect(simulatedPayPal?.orderLinks(orderId)?.amount).toEqual({ cents: 150_00, currency: 'EUR' })
    simulatedPayPal?.approveOrder(orderId)
    expect(await renter.confirmHold(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'placed' } })
    const hold = (await database.select().from(holds)).find((row) => row.rentalId === rentalId)
    const authorization = (await database.select().from(authorizations)).find((row) => row.holdId === hold?.id)
    expect(authorization?.amountCents).toBe(150_00)
    expect((await database.select().from(moneyEvents)).filter((line) => line.rentalId === rentalId && line.kind === 'hold_placed').map((line) => line.amountCents)).toEqual([150_00])
    const ladderRow = (await database.select().from(trustLadders)).find((row) => row.shopId === shopB.shopId)
    expect((await database.select().from(rentals)).find((row) => row.id === rentalId)).toMatchObject({ trustLadderId: ladderRow?.id, trustRung: 2 })
    expect(hold).toMatchObject({ ordinaryCents: 300_00, trustRung: 2, cleanReturns: 5 })
  })

  it('is the ordinary hold again once the renter deletes their record (X2.6)', async () => {
    const { token } = await paidRental(shopB)
    expect(await renterTrust.deleteRecord(null, form({ token, understood: 'yes', locale: 'en' }))).toEqual({ ok: true, value: { removed: 5 } })
    expect((await heldAtPickup(shopB)).reservedCents).toBe(300_00)
  })

  it('refuses consent or deletion through a link that is not one', async () => {
    expect(await renterTrust.answerConsent(null, form({ token: 'not-a-token', consent: 'yes', locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
    expect(await renterTrust.deleteRecord(null, form({ token: 'not-a-token', understood: 'yes', locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
  })
})
