// @vitest-environment node
import { agentSessions, captureSession, claims, inShop, moneyEvents, priceEntries, recordPhoto, rentalDetail, renterNegotiation, sealSession, shopNegotiation, staffRoles, startCaptureSession, users } from '@hold/db'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 12).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const claimActions = await import('@/features/claims/actions')
const claimRenter = await import('@/features/claims/renter-actions')
const actions = await import('./actions')
const renter = await import('./renter-actions')
const { getServices, TEST_SIGN_IN_CODE } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const OWNER = 'owner@negotiation-flow.example'
const MANAGER = 'manager@negotiation-flow.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Negotiation Bikes')
  priceId = (await scoped((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  // A manager, who may confirm a contested claim's result but not set the owner's limits.
  const subject = await signIn(jar, MANAGER, 'passkey')
  const { database } = await getServices()
  const [manager] = await database.insert(users).values({ cognitoSubject: subject, email: MANAGER, name: 'Marta' }).returning()
  await database.insert(staffRoles).values({ shopId: shop.shopId, userId: manager?.id ?? '', role: 'manager', approvalLimitCents: 100_00 })
})
beforeEach(() => { jar.clear() })

// A returned rental with a presented claim of one scratch at 35.00, raised by the owner; the renter's claim link.
async function presented() {
  const rental = await shop.readyRental()
  const item = (await scoped((transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const { rentalItemFor } = await import('@hold/db')
  const rentalItemId = await scoped((transaction) => rentalItemFor(transaction, rental.rentalId, item))
  for (const kind of ['handover', 'return'] as const) {
    const session = await scoped((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rentalItemId ?? '', kind, actorUserId: null }, new Date()))
    if (!session.ok) throw new Error(session.reason)
    const capture = await scoped((transaction) => captureSession(transaction, session.sessionId))
    for (const view of capture?.plan.filter((each) => each.required) ?? []) await scoped((transaction) => recordPhoto(transaction, session.sessionId, { view: view.key, evidenceKey: randomUUID(), sha256: 'a'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: .6 } }, new Date()))
    await scoped((transaction) => sealSession(transaction, session.sessionId, new Date()))
  }
  await signIn(jar, OWNER, 'passkey')
  const created = await claimActions.prepareClaim(null, form({ rentalId: rental.rentalId, lines: JSON.stringify([{ priceEntryId: priceId, reason: 'Scratch on the frame, inspected in person.' }]), locale: 'en' }))
  if (!created.ok) throw new Error(JSON.stringify(created))
  const approved = await claimActions.approveAndPresent(null, form({ claimId: created.value.claimId, locale: 'en' }))
  if (!approved.ok) throw new Error(JSON.stringify(approved))
  const token = approved.value.url.split('/r/')[1]?.split('/')[0] ?? ''
  jar.clear()
  expect(await claimRenter.acknowledgeClaim(null, form({ token, locale: 'en' }))).toMatchObject({ ok: true })
  return { ...rental, claimId: created.value.claimId, claimToken: token }
}
const claimState = async (claimId: string) => (await scoped((transaction) => transaction.select().from(claims))).find((row) => row.id === claimId)?.state
const captured = async (rentalId: string) => (await scoped((transaction) => transaction.select().from(moneyEvents))).filter((row) => row.rentalId === rentalId && row.kind === 'hold_captured').map((row) => row.amountCents)

describe('the owner’s settlement limits', () => {
  it('are set by the owner alone, with a passkey', async () => {
    const limits = { lowestShare: '50', largestClaim: '200', rounds: '6', evidenceRequired: 'yes', days: '90', locale: 'en' }
    expect(await actions.saveSettlementLimits(null, form(limits))).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, MANAGER, 'passkey')
    expect(await actions.saveSettlementLimits(null, form(limits))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'email_code')
    expect(await actions.saveSettlementLimits(null, form(limits))).toEqual({ ok: false, failure: 'passkey_needed' })
    await signIn(jar, OWNER, 'passkey')
    expect(await actions.saveSettlementLimits(null, form({ ...limits, lowestShare: '150' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await actions.saveSettlementLimits(null, form({ ...limits, finalTap: 'no' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await actions.saveSettlementLimits(null, form(limits))).toMatchObject({ ok: true })
  })
})

describe('a contest argued by two advocates', () => {
  it('settles: the renter sets a highest total with their code, the advocates agree, both people confirm, and only the agreed total is captured (X4.1 in the test environment)', async () => {
    const rental = await presented()
    expect(await claimRenter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: '00000000', highest: '30', locale: 'en' }))).toMatchObject({ ok: false, reason: 'wrong_code' })
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30', locale: 'en' }))).toMatchObject({ ok: true })
    // The simulated advocates have run: the scratch with no photographs is ordinary wear, and they meet at half.
    expect(await claimState(rental.claimId)).toBe('agreed')
    expect(await renter.confirmSettlement(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, decision: 'confirm', locale: 'en' }))).toMatchObject({ ok: false, reason: 'code_expired' })
    expect(await renter.sendSettlementCode(null, form({ token: rental.claimToken, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await renter.confirmSettlement(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, decision: 'confirm', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await captured(rental.rentalId)).toEqual([])
    const view = await scoped((transaction) => shopNegotiation(transaction, rental.rentalId))
    await signIn(jar, MANAGER, 'passkey')
    expect(await actions.confirmSettlementForShop(null, form({ negotiationId: view?.transcript.id ?? '', decision: 'confirm', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await captured(rental.rentalId)).toEqual([view?.transcript.agreedCents])
    expect(view?.transcript.agreedCents).toBeLessThanOrEqual(30_00)
  })

  it('goes to the owner when the limits do not meet, nothing is captured, and the owner decides with the transcript (X4.3)', async () => {
    const rental = await presented()
    await claimRenter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))
    // A highest total below anything the shop may agree to.
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '0', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await claimState(rental.claimId)).toBe('escalated')
    expect(await renter.stopAdvocate(null, form({ token: rental.claimToken, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await captured(rental.rentalId)).toEqual([])
    await signIn(jar, MANAGER, 'passkey')
    expect(await claimActions.decide(null, form({ claimId: rental.claimId, decision: 'uphold', reason: 'The scratch is fresh; the transcript changes nothing.', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await captured(rental.rentalId)).toEqual([35_00])
  })

  it('hands the contest to the renter’s own connected assistant when they choose it, and Hold’s advocate never moves for them', async () => {
    const rental = await presented()
    const { database } = await getServices()
    await database.insert(agentSessions).values({ shopId: shop.shopId, rentalId: rental.rentalId, bookingSecretFingerprint: `booking-${randomUUID()}`, tokenFingerprint: `token-${randomUUID()}`, scopes: ['rental', 'hold', 'condition', 'claim', 'record'], clientLabel: 'Trip planner', tokenIssuedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000) })
    await claimRenter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30', advocate: 'assistant', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await claimState(rental.claimId)).toBe('negotiating')
    const view = await scoped((transaction) => renterNegotiation(transaction, rental.rentalId))
    expect(view).toMatchObject({ advocate: 'assistant', transcript: { state: 'open', moves: [{ actor: 'referee' }] } })
  })

  it('refuses the assistant as advocate when none is connected, and the claim stays unanswered', async () => {
    const rental = await presented()
    await claimRenter.sendClaimCode(null, form({ token: rental.claimToken, locale: 'en' }))
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30', advocate: 'assistant', locale: 'en' }))).toMatchObject({ ok: false, reason: 'assistant_not_connected' })
    expect(await claimState(rental.claimId)).toBe('presented')
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30', advocate: 'robot', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })

  it('refuses a link without the scope, a renter amount in part cents, and staff who may not confirm', async () => {
    const rental = await presented()
    expect(await renter.startAdvocate(null, form({ token: rental.token, code: TEST_SIGN_IN_CODE, highest: '30', locale: 'en' }))).toEqual({ ok: false, failure: 'scope' })
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30.555', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await renter.startAdvocate(null, form({ token: rental.claimToken, code: TEST_SIGN_IN_CODE, highest: '30', amount: '1', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await actions.confirmSettlementForShop(null, form({ negotiationId: randomUUID(), decision: 'confirm', locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
  })
})
