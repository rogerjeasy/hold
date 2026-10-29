// @vitest-environment node
import { contestSummaries, inShop, moneyEvents, priceEntries } from '@hold/db'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 11).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const actions = await import('./actions')
const renter = await import('./renter-actions')
const { getServices, TEST_SIGN_IN_CODE } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { inspectedRental, presentedClaim } = await import('@/test/presented-claim')
const OWNER = 'owner@claim-flow.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string
beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Claim Bikes')
  const { database } = await getServices()
  priceId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
})
beforeEach(() => { jar.clear() })
const inspected = () => inspectedRental(jar, shop)
const presented = () => presentedClaim(jar, shop, priceId)
describe('a neutral summary when the renter contests (architecture.md section 6.15)', () => {
  const summaries = async (claimId: string) => (await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(contestSummaries))).filter((row) => row.claimId === claimId)

  it('is written as soon as the renter contests, from the record, and marked simulated where no model ran', async () => {
    const rental = await presented()
    jar.clear()
    await renter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))
    expect(await renter.contestClaim(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, comment: 'The scratch on the frame was there when I picked it up.', locale: 'en' }))).toMatchObject({ ok: true })
    const written = await summaries(rental.claimId)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ outcome: 'answered', simulated: true, promptVersion: 'contest-2' })
    const words = [written[0]?.summary?.forShop, written[0]?.summary?.forRenter].flatMap((version) => [version?.overview ?? '', ...(version?.lines ?? []).map((line) => line.renterSays ?? '')])
    expect(words.join(' ')).not.toMatch(/\d/)
  })

  it('can be written again by the owner, and only once a contest exists', async () => {
    const rental = await presented()
    await signIn(jar, OWNER, 'passkey')
    expect(await actions.rewriteContestSummary(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_contested' })
    jar.clear()
    await renter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))
    await renter.contestClaim(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, comment: 'Not mine.', locale: 'en' }))
    expect(await actions.rewriteContestSummary(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, OWNER, 'passkey')
    expect(await actions.rewriteContestSummary(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await summaries(rental.claimId)).toHaveLength(2)
  })
})

describe('claim approval and renter settlement', () => {
  it('requires a payer-email code before accepting, then captures only the approved stored amount', async () => {
    const rental = await presented()
    jar.clear()
    expect(await renter.acceptClaim(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, locale: 'en' }))).toMatchObject({ ok: false, reason: 'code_expired' })
    expect(await renter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await renter.acceptClaim(null, form({ token: rental.claimToken, code: '00000000', locale: 'en' }))).toMatchObject({ ok: false, reason: 'wrong_code' })
    expect(await renter.acceptClaim(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await renter.acceptClaim(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, locale: 'en' }))).toMatchObject({ ok: false })
    const events = await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(moneyEvents))
    expect(events.filter((row) => row.rentalId === rental.rentalId && row.kind === 'hold_captured').map((row) => row.amountCents)).toEqual([3500])
    expect(events.filter((row) => row.rentalId === rental.rentalId && row.kind === 'hold_released').map((row) => row.amountCents)).toEqual([26500])
  })
  it('refuses booking scopes, unknown money fields and signed-out staff', async () => {
    const rental = await inspected()
    expect(await actions.prepareClaim(null, form({ rentalId: rental.rentalId, lines: JSON.stringify([{ priceEntryId: priceId, amount: 1, reason: 'Override' }]), locale: 'en' }))).toMatchObject({ ok: false })
    jar.clear()
    expect(await actions.confirmClean(null, form({ rentalId: rental.rentalId, reason: 'Clean', locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
    expect(await renter.sendClaimCode(null, form({ token: rental.token, locale: 'en' }))).toEqual({ ok: false, failure: 'scope' })
  })
})

it('starts no reply clock until the renter confirms they reviewed the approved claim', async () => {
  const { claimWorkspace } = await import('@hold/db')
  const rental = await inspected()
  const created = await actions.prepareClaim(null, form({ rentalId: rental.rentalId, lines: JSON.stringify([{ priceEntryId: priceId, reason: 'Verified scratch.' }]), locale: 'en' }))
  if (!created.ok) throw new Error(JSON.stringify(created))
  const approved = await actions.approveAndPresent(null, form({ claimId: created.value.claimId, locale: 'en' }))
  if (!approved.ok) throw new Error(JSON.stringify(approved))
  const read = async () => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => claimWorkspace(transaction, rental.rentalId))
  expect((await read())?.claim).toMatchObject({ state: 'approved', replyDueAt: null })
  jar.clear()
  const token = approved.value.url.split('/r/')[1]?.split('/')[0] ?? ''
  expect(await renter.acknowledgeClaim(null, form({ token, locale: 'en' }))).toMatchObject({ ok: true })
  expect((await read())?.claim?.state).toBe('presented')
})
