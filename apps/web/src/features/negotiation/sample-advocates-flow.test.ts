// @vitest-environment node
import { claims, inShop, moneyEvents, openDemoSession, rateTokensLeft, rentals, renters, shopNegotiation, takeRateToken } from '@hold/db'
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
const { SAMPLE_ADVOCATE_LIMITS, sampleAdvocateShares, sampleAdvocatesAllowance } = await import('./limits')
const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

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

  // A demo of its own for each case, as a judge would start one.
  const openSample = async (name: string) => {
    const { database } = await getServices()
    const owner = await signIn(jar, `tomas@${name}.example`, 'passkey')
    const staff = await signIn(jar, `jonas@${name}.example`, 'passkey')
    const opened = await openDemoSession(database, { owner: { subject: owner, email: `tomas@${name}.example` }, staff: { subject: staff, email: `jonas@${name}.example` }, slug: `ribeira-bikes-${name}`, paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
    shopId = opened.shopId
    const rentalId = await rentalOf('Elena Duarte')
    await signIn(jar, `tomas@${name}.example`, 'email_code')
    return rentalId
  }
  // The test requests carry no network address, so each counts as the one unnamed network.
  const spend = async (share: 'shop' | 'network' | 'day') => {
    const { database } = await getServices()
    const found = sampleAdvocateShares(shopId, 'unknown', new Date()).find((each) => each.share === share)
    while (found !== undefined && await takeRateToken(database, found.limit, found.subject)) { /* spend the share */ }
  }

  it('says before anyone asks how many live runs are left, and which share runs out first', async () => {
    await openSample('sample-allowance')
    // One run went to the first demo from this network; this demo still has its own.
    expect(await sampleAdvocatesAllowance(shopId)).toEqual({ left: Math.min(SAMPLE_ADVOCATE_LIMITS.perShop.max, SAMPLE_ADVOCATE_LIMITS.perNetwork.max - 1), refusal: null })
  })

  it('stops once the day’s sample runs are spent, says so on reload, and a refused attempt spends nothing', async () => {
    const rentalId = await openSample('sample-cap')
    await spend('day')
    expect(await sampleAdvocatesAllowance(shopId)).toEqual({ left: 0, refusal: 'daily_cap' })
    expect(await actions.argueSampleClaim(null, form({ rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap' })
    expect(await claimState(rentalId)).toBe('presented')
    // The shop's and the network's shares taken before the day refused were given back with the transaction.
    const { database } = await getServices()
    const network = sampleAdvocateShares(shopId, 'unknown', new Date()).find((each) => each.share === 'network')
    expect(network === undefined ? 0 : await rateTokensLeft(database, network.limit, network.subject)).toBe(SAMPLE_ADVOCATE_LIMITS.perNetwork.max - 1)
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: 'sample_advocates_refused', share: 'day', shopId }))
  })

  it('lets one network run only its share of samples a day, even from another demo', async () => {
    const rentalId = await openSample('sample-network')
    await spend('network')
    expect(await sampleAdvocatesAllowance(shopId)).toEqual({ left: 0, refusal: 'daily_cap_network' })
    expect(await actions.argueSampleClaim(null, form({ rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap_network' })
    expect(await claimState(rentalId)).toBe('presented')
  })

  it('lets one demo run its sample once a day, whichever network asks', async () => {
    const rentalId = await openSample('sample-shop')
    await spend('shop')
    expect(await sampleAdvocatesAllowance(shopId)).toEqual({ left: 0, refusal: 'daily_cap_shop' })
    expect(await actions.argueSampleClaim(null, form({ rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap_shop' })
    expect(await claimState(rentalId)).toBe('presented')
  })
})
