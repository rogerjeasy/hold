// @vitest-environment node
import { inShop, itemCatalog, registerOwner, rentalDetail, takeEmailAllowance } from '@hold/db'
import { EMAIL_LIMITS } from '@hold/domain'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 11).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.90' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`) }))

const rentals = await import('./actions')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

vi.setConfig({ testTimeout: 60_000 })

// The public demo must never become a way to send mail at will: every email someone asks Hold to send counts against
// the day's allowance (packages/domain EMAIL_LIMITS, architecture.md section 15). What the email was for still happens.

const OWNER = 'owner@email-allowance.example'
let shopId: string
let ownerId: string
let typeId: string

const day = (offset: number) => `${new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T10:00`
let nextFrom = 40
const booking = (contactEmail: string) => {
  nextFrom += 4
  return { startsAt: day(nextFrom), endsAt: day(nextFrom + 2), itemTypeId: typeId, count: '1', contactName: 'Priya Natarajan', contactEmail, language: 'en', locale: 'en' }
}

const sentTo = async (address: string) => ((await getServices()).mailer as unknown as { sent: { to: string }[] }).sent.filter((email) => email.to === address).length

// Spends one share of this shop's emails for the day, as earlier requests would have.
async function spend(target: { readonly rentalId: string | null; readonly to: string }) {
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId } as const
  while (await inShop(database, scope, (transaction) => takeEmailAllowance(transaction, { shopId, rentalId: target.rentalId, to: target.to, essential: true, network: '203.0.113.90' }))) { /* spend it */ }
}

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  const registered = await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Allowance Rentals', timeZone: 'UTC' } })
  shopId = registered.shopId
  ownerId = registered.userId
  expect(await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await items.saveItemType(null, form({ itemTypeId: '', name: 'City bike', category: 'bike', value: '800', hold: '200', dayRate: '20', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }))).toMatchObject({ ok: true })
  typeId = (await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: typeId, count: '5', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
})

beforeEach(() => {
  jar.clear()
  info.mockClear()
})

describe('the renter’s link, once the day’s emails to an address are spent', () => {
  it('still books, holds the email, says so, and logs it without the address', async () => {
    const address = 'spent@email-allowance.example'
    await spend({ rentalId: null, to: address })
    await signIn(jar, OWNER, 'email_code')
    const booked = await rentals.bookRental(null, form(booking(address)))
    expect(booked).toMatchObject({ ok: true, value: { sent: 'held' } })
    if (!booked.ok) return
    const { database } = await getServices()
    expect(await inShop(database, { role: 'hold_app', shopId }, (transaction) => rentalDetail(transaction, booked.value.rentalId, new Date()))).toMatchObject({ state: 'pending_payment' })
    expect(await sentTo(address)).toBe(0)
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: 'email_held', shopId, rentalId: booked.value.rentalId }))
    expect(JSON.stringify(info.mock.calls)).not.toContain(address)
  })

  it('refuses to send it again, and the link can still be shown', async () => {
    const address = 'again@email-allowance.example'
    await signIn(jar, OWNER, 'email_code')
    const booked = await rentals.bookRental(null, form(booking(address)))
    expect(booked).toMatchObject({ ok: true, value: { sent: 'email' } })
    if (!booked.ok) return
    await spend({ rentalId: booked.value.rentalId, to: 'someone@email-allowance.example' })
    const before = await sentTo(address)
    expect(await rentals.sendRenterLinkAgain(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'email_daily_cap' })
    expect(await sentTo(address)).toBe(before)
    expect(await rentals.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))).toMatchObject({ ok: true })
  })

  it('still emails a different renter of the same shop', async () => {
    const address = 'fresh@email-allowance.example'
    await signIn(jar, OWNER, 'email_code')
    expect(await rentals.bookRental(null, form(booking(address)))).toMatchObject({ ok: true, value: { sent: 'email' } })
    expect(await sentTo(address)).toBe(1)
  })
})

describe('a staff invitation, once the shop’s emails for the day are spent', () => {
  it('is refused and not kept, while another shop still invites', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await shop.inviteStaff(null, form({ email: 'first-staff@email-allowance.example', role: 'counter_staff', approvalLimit: '', locale: 'en' }))).toMatchObject({ ok: true })
    for (let sent = 0; sent < EMAIL_LIMITS.perShopPerDay; sent += 1) await spend({ rentalId: null, to: `filler-${String(sent)}@email-allowance.example` })
    const refused = 'refused-staff@email-allowance.example'
    expect(await shop.inviteStaff(null, form({ email: refused, role: 'counter_staff', approvalLimit: '', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'email_daily_cap' })
    expect(await sentTo(refused)).toBe(0)
  })
})
