// @vitest-environment node
import { claims, inShop, moneyEvents, openDemoSession, rentals, renters, shopNegotiation, takeRateToken } from '@hold/db'
import { utcDay } from '@hold/domain'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 13).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
vi.setConfig({ testTimeout: 60_000 })
const actions = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { SAMPLE_ADVOCATE_LIMITS } = await import('./limits')

// A judge watches the two advocates argue the demo's sample claim that waits for a reply (extensions.md section 9).
// The renter is made up, so the owner starts it; nothing about it can ever reach PayPal.
const OWNER = 'tomas@sample-advocates.example'
const STAFF = 'jonas@sample-advocates.example'
let shopId: string
let sampleRentalId: string
let contestedRentalId: string
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId }, work)
const rentalOf = async (name: string) => {
  const renter = (await scoped((transaction) => transaction.select().from(renters))).find((row) => row.name === name)
  return (await scoped((transaction) => transaction.select().from(rentals))).find((row) => row.renterId === renter?.id)?.id ?? ''
}
const claimState = async (rentalId: string) => (await scoped((transaction) => transaction.select().from(claims))).find((row) => row.rentalId === rentalId)?.state

beforeAll(async () => {
  const { database } = await getServices()
  const owner = await signIn(jar, OWNER, 'passkey')
  const staff = await signIn(jar, STAFF, 'passkey')
  const opened = await openDemoSession(database, { owner: { subject: owner, email: OWNER }, staff: { subject: staff, email: STAFF }, slug: 'ribeira-bikes-sampleadv', paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
  shopId = opened.shopId
  sampleRentalId = await rentalOf('Elena Duarte')
  contestedRentalId = await rentalOf('Tom Becker')
})
beforeEach(() => { jar.clear() })

describe('the advocates on the demo’s sample claim', () => {
  it('may be started by the owner or a manager only', async () => {
    const input = form({ rentalId: sampleRentalId, locale: 'en' })
    expect(await actions.argueSampleClaim(null, input)).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, STAFF, 'email_code')
    expect(await actions.argueSampleClaim(null, input)).toEqual({ ok: false, failure: 'role' })
    expect(await claimState(sampleRentalId)).toBe('presented')
  })

  it('refuses a claim that was already answered', async () => {
    await signIn(jar, OWNER, 'email_code')
    expect(await actions.argueSampleClaim(null, form({ rentalId: contestedRentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'already_replied' })
  })

  it('runs both advocates without a passkey, and what they agree can never be confirmed into a capture', async () => {
    await signIn(jar, OWNER, 'email_code')
    expect(await actions.argueSampleClaim(null, form({ rentalId: sampleRentalId, locale: 'en' }))).toMatchObject({ ok: true })
    // In the test environment the stand-in advocates have already run: the sample renter's limit meets the shop's.
    expect(await claimState(sampleRentalId)).toBe('agreed')
    const view = await scoped((transaction) => shopNegotiation(transaction, sampleRentalId))
    expect(view?.transcript).toMatchObject({ state: 'agreed', sample: true })
    await signIn(jar, OWNER, 'passkey')
    expect(await actions.confirmSettlementForShop(null, form({ negotiationId: view?.transcript.id ?? '', decision: 'confirm', locale: 'en' }))).toMatchObject({ ok: false, reason: 'simulated_rental' })
    expect((await scoped((transaction) => transaction.select().from(moneyEvents))).filter((event) => event.rentalId === sampleRentalId).map((event) => event.kind)).not.toContain('hold_captured')
  })

  it('lets one network run one sample a day, even from another demo', async () => {
    const { database } = await getServices()
    const owner = await signIn(jar, 'tomas@sample-network.example', 'passkey')
    const staff = await signIn(jar, 'jonas@sample-network.example', 'passkey')
    const opened = await openDemoSession(database, { owner: { subject: owner, email: 'tomas@sample-network.example' }, staff: { subject: staff, email: 'jonas@sample-network.example' }, slug: 'ribeira-bikes-samplenet', paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
    shopId = opened.shopId
    const rentalId = await rentalOf('Elena Duarte')
    await signIn(jar, 'tomas@sample-network.example', 'email_code')
    expect(await actions.argueSampleClaim(null, form({ rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap' })
    expect(await claimState(rentalId)).toBe('presented')
  })

  it('stops once the day’s sample runs are spent, since every run spends the account’s Claude tokens', async () => {
    const { database } = await getServices()
    while (await takeRateToken(database, SAMPLE_ADVOCATE_LIMITS.perDay, utcDay(new Date()))) { /* spend the day */ }
    const { database: db } = await getServices()
    const owner = await signIn(jar, 'tomas@sample-cap.example', 'passkey')
    const staff = await signIn(jar, 'jonas@sample-cap.example', 'passkey')
    const opened = await openDemoSession(db, { owner: { subject: owner, email: 'tomas@sample-cap.example' }, staff: { subject: staff, email: 'jonas@sample-cap.example' }, slug: 'ribeira-bikes-samplecap', paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
    shopId = opened.shopId
    const rentalId = await rentalOf('Elena Duarte')
    await signIn(jar, 'tomas@sample-cap.example', 'email_code')
    expect(await actions.argueSampleClaim(null, form({ rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap' })
    expect(await claimState(rentalId)).toBe('presented')
  })
})
