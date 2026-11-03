// @vitest-environment node
import { comparisonReport, inShop, moneyEvents, openDemoSession, rentalReturns, rentals, renters, takeRateToken } from '@hold/db'
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
const { SAMPLE_COMPARISON_LIMITS } = await import('./limits')

// A judge has Claude compare the demonstration's own photographs on the sample return that waits for its comparison,
// with no PayPal login (architecture.md section 20.3). In the test environment the model is the stand-in, which never
// answers, so the comparison says the model did not answer, having read both sample photographs.
let shopId = ''
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId }, work)
const rentalOf = async (name: string) => {
  const renter = (await scoped((transaction) => transaction.select().from(renters))).find((row) => row.name === name)
  return (await scoped((transaction) => transaction.select().from(rentals))).find((row) => row.renterId === renter?.id)?.id ?? ''
}
const comparisonOf = async (rentalId: string) => {
  const [returned] = await scoped((transaction) => rentalReturns(transaction, rentalId))
  return scoped((transaction) => comparisonReport(transaction, returned?.comparisonId ?? ''))
}
async function demo(slug: string) {
  const { database } = await getServices()
  const owner = await signIn(jar, `tomas@${slug}.example`, 'passkey')
  const staff = await signIn(jar, `jonas@${slug}.example`, 'passkey')
  const opened = await openDemoSession(database, { owner: { subject: owner, email: `tomas@${slug}.example` }, staff: { subject: staff, email: `jonas@${slug}.example` }, slug: `ribeira-bikes-${slug}`, paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
  shopId = opened.shopId
  return { staff: `jonas@${slug}.example`, rentalId: await rentalOf('Marco Rossi') }
}

beforeEach(() => { jar.clear() })

describe('the real comparison on the demo’s sample return', () => {
  let started: Awaited<ReturnType<typeof demo>>
  beforeAll(async () => { started = await demo('samplecmp') })

  it('needs a person signed in to the shop', async () => {
    expect(await actions.compareSample(null, form({ rentalId: started.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
  })

  it('may be started by counter staff, reads the sample photographs, and moves no money', async () => {
    await signIn(jar, started.staff, 'email_code')
    expect(await actions.compareSample(null, form({ rentalId: started.rentalId, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await comparisonOf(started.rentalId)).toMatchObject({ state: 'deferred', deferredReason: 'model_unavailable', model: 'not_called', simulated: true, waitsForStart: false })
    expect((await scoped((transaction) => transaction.select().from(moneyEvents))).filter((event) => event.rentalId === started.rentalId).map((event) => event.kind)).toEqual(['fee_captured', 'hold_placed'])
  })

  it('runs once: a comparison already started is not started again', async () => {
    await signIn(jar, started.staff, 'email_code')
    expect(await actions.compareSample(null, form({ rentalId: started.rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'nothing_to_compare' })
  })

  it('stops once the day’s sample comparisons are spent, and leaves the comparison waiting', async () => {
    const { database } = await getServices()
    while (await takeRateToken(database, SAMPLE_COMPARISON_LIMITS.perDay, utcDay(new Date()))) { /* spend the day */ }
    const capped = await demo('samplecmpcap')
    await signIn(jar, capped.staff, 'email_code')
    expect(await actions.compareSample(null, form({ rentalId: capped.rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'daily_cap' })
    expect(await comparisonOf(capped.rentalId)).toMatchObject({ state: 'pending', waitsForStart: true })
  })
})
