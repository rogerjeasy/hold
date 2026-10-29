// @vitest-environment node
import { acceptInvitation, claimMessages, claims, createInvitation, inShop, keepClaimPromise, mandates, priceEntries, renterContact, shops, staffRoles } from '@hold/db'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 53).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined), set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))

const promise = await import('./actions')
const renterPromise = await import('./renter-actions')
const claimActions = await import('@/features/claims/actions')
const renterClaims = await import('@/features/claims/renter-actions')
const { getServices, TEST_SIGN_IN_CODE } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaim } = await import('@/test/presented-claim')

vi.setConfig({ testTimeout: 60_000 })

const OWNER = 'owner@promise-a.example'
const MANAGER = 'manager@promise-a.example'
const READER = 'reader@promise-a.example'
const locale = { locale: 'en' }
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string

const database = async () => (await getServices()).database
const sent = async () => ((await getServices()).mailer as unknown as { sent: readonly { to: string; subject: string; text: string }[] }).sent

async function join(email: string, role: 'manager' | 'read_only') {
  const db = await database()
  const ownerId = (await db.select().from(staffRoles)).find((row) => row.shopId === shop.shopId && row.role === 'owner')?.userId ?? ''
  const { token } = await inShop(db, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) => createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()))
  const subject = await signIn(jar, email, 'passkey')
  await acceptInvitation(db, { token, subject, email, name: role, language: 'en' }, new Date())
}

async function contested() {
  const claim = await presentedClaim(jar, shop, priceId)
  jar.clear()
  await renterClaims.sendClaimCode(null, form({ token: claim.claimToken, ...locale }))
  const replied = await renterClaims.contestClaim(null, form({ token: claim.claimToken, code: TEST_SIGN_IN_CODE, comment: 'The scratch was there at pickup.', ...locale }))
  if (!replied.ok) throw new Error(JSON.stringify(replied))
  return claim
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Ribeira Promise Bikes')
  priceId = (await inShop(await database(), { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  await join(MANAGER, 'manager')
  await join(READER, 'read_only')
})
beforeEach(() => { jar.clear() })

describe('the renter writes to the shop from the claim page', () => {
  it('records the words and tells the owners and managers, without quoting them', async () => {
    const claim = await contested()
    expect(await renterPromise.writeToShop(null, form({ token: claim.claimToken, body: 'I have a photo from pickup.', ...locale }))).toMatchObject({ ok: true })
    expect(await inShop(await database(), { role: 'hold_app', shopId: shop.shopId }, (transaction) => claimMessages(transaction, claim.rentalId))).toEqual([expect.objectContaining({ author: 'renter', body: 'I have a photo from pickup.' })])
    const told = (await sent()).filter((email) => email.subject === 'wroteSubject' || email.text.includes(`/shop/rentals/${claim.rentalId}/claim`))
    expect(told.map((email) => email.to).sort()).toEqual([MANAGER, OWNER].sort())
    expect(told.every((email) => !email.text.includes('I have a photo from pickup.'))).toBe(true)
  })

  it('needs the claim link: a booking link, a forged token and an empty message are refused', async () => {
    const claim = await contested()
    expect(await renterPromise.writeToShop(null, form({ token: claim.token, body: 'Hello', ...locale }))).toMatchObject({ ok: false })
    expect(await renterPromise.writeToShop(null, form({ token: `${claim.claimToken}x`, body: 'Hello', ...locale }))).toMatchObject({ ok: false })
    expect(await renterPromise.writeToShop(null, form({ token: claim.claimToken, body: '   ', ...locale }))).toMatchObject({ ok: false, failure: 'refused', reason: 'message_invalid' })
  })

  it('is rate limited for each link', async () => {
    const claim = await contested()
    const results = []
    for (let index = 0; index < 11; index += 1) results.push(await renterPromise.writeToShop(null, form({ token: claim.claimToken, body: `Message ${String(index)}`, ...locale })))
    expect(results.slice(0, 10).every((result) => result.ok)).toBe(true)
    expect(results[10]).toMatchObject({ ok: false, failure: 'refused', reason: 'rate_limited' })
  })
})

describe('staff answer on the claim page', () => {
  it('records the answer under the person’s name and emails it to the renter', async () => {
    const claim = await contested()
    await signIn(jar, MANAGER, 'passkey')
    expect(await promise.writeToRenter(null, form({ rentalId: claim.rentalId, body: 'We will decide by Tuesday.', ...locale }))).toMatchObject({ ok: true })
    const contact = await inShop(await database(), { role: 'hold_app', shopId: shop.shopId }, (transaction) => renterContact(transaction, claim.rentalId))
    expect((await sent()).at(-1)).toMatchObject({ to: contact?.email, text: expect.stringContaining('We will decide by Tuesday.') as unknown })
  })

  it('refuses someone signed out or read-only', async () => {
    const claim = await contested()
    expect(await promise.writeToRenter(null, form({ rentalId: claim.rentalId, body: 'Hi', ...locale }))).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, READER, 'passkey')
    expect(await promise.writeToRenter(null, form({ rentalId: claim.rentalId, body: 'Hi', ...locale }))).toEqual({ ok: false, failure: 'role' })
  })
})

describe('the owner’s promise', () => {
  it('is set by the owner alone, within one to fourteen days', async () => {
    await signIn(jar, MANAGER, 'passkey')
    expect(await promise.savePromiseDays(null, form({ days: '5', ...locale }))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'passkey')
    expect(await promise.savePromiseDays(null, form({ days: '0', ...locale }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await promise.savePromiseDays(null, form({ days: '15', ...locale }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await promise.savePromiseDays(null, form({ days: '5', ...locale }))).toMatchObject({ ok: true })
    expect((await (await database()).select().from(shops)).find((row) => row.id === shop.shopId)?.decisionPromiseDays).toBe(5)
    expect(await promise.savePromiseDays(null, form({ days: '3', ...locale }))).toMatchObject({ ok: true })
  })

  it('may be backed by a rule that waives a missed claim, granted by the owner with a passkey and revoked by the owner', async () => {
    const limits = { dailyCount: '5', days: '60', ...locale }
    await signIn(jar, OWNER, 'email_code')
    expect(await promise.grantPromiseWaiver(null, form(limits))).toEqual({ ok: false, failure: 'passkey_needed' })
    await signIn(jar, MANAGER, 'passkey')
    expect(await promise.grantPromiseWaiver(null, form(limits))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'passkey')
    expect(await promise.grantPromiseWaiver(null, form({ ...limits, dailyCount: '0' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await promise.grantPromiseWaiver(null, form(limits))).toMatchObject({ ok: true })
    const live = (await (await database()).select().from(mandates)).filter((row) => row.shopId === shop.shopId && row.revokedAt === null)
    expect(live.map((row) => row.limits)).toEqual([{ proposalKind: 'release_hold', condition: 'decision_promise_missed', dailyCount: 5 }])
    expect(await promise.revokePromiseWaiver(null, form(locale))).toMatchObject({ ok: true })
    expect(await promise.revokePromiseWaiver(null, form(locale))).toMatchObject({ ok: false, reason: 'standing_rule_off' })
  })
})

describe('a missed promise', () => {
  it('leaves the decision to the owner alone', async () => {
    const claim = await contested()
    const db = await database()
    const row = (await db.select().from(claims)).find((each) => each.id === claim.claimId)
    await inShop(db, { role: 'hold_worker', shopId: shop.shopId }, (transaction) => keepClaimPromise(transaction, claim.claimId, row?.decideBy ?? new Date()))
    await signIn(jar, MANAGER, 'passkey')
    expect(await claimActions.decide(null, form({ claimId: claim.claimId, decision: 'waive', reason: 'Not clear enough.', ...locale }))).toMatchObject({ ok: false, failure: 'refused', reason: 'owner_decides_after_promise' })
    await signIn(jar, OWNER, 'passkey')
    expect(await claimActions.decide(null, form({ claimId: claim.claimId, decision: 'waive', reason: 'Not clear enough.', ...locale }))).toMatchObject({ ok: true })
  })
})
