// @vitest-environment node
import { acceptInvitation, captureSessions, createInvitation, inShop, itemRepairs, marks, openRepairsForClaim, priceEntries, rentalItems, staffRoles } from '@hold/db'
import type { TestDatabase } from '@hold/db/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 61).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined), set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))

const repairs = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaim } = await import('@/test/presented-claim')

vi.setConfig({ testTimeout: 60_000 })

const OWNER = 'owner@repair-a.example'
const READER = 'reader@repair-a.example'
const locale = { locale: 'en' }
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string
const database = async () => (await getServices()).database
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(await database(), { role: 'hold_app', shopId: shop.shopId }, work)

// A charged claim on a person's written line, so its repair has nothing to photograph.
async function chargedRepair() {
  const claim = await presentedClaim(jar, shop, priceId)
  const db = await database()
  // PayPal's confirmed capture is the settle package's to test; here the claim is simply charged.
  await (db as unknown as TestDatabase).$client.query("update claims set state = 'charged' where id = $1", [claim.claimId])
  await inShop(db, { role: 'hold_worker', shopId: shop.shopId }, (transaction) => openRepairsForClaim(transaction, claim.claimId, new Date()))
  const itemId = (await db.select().from(rentalItems)).find((row) => row.rentalId === claim.rentalId)?.itemId ?? ''
  const repair = (await scoped((transaction) => itemRepairs(transaction, itemId))).find((each) => each.claimId === claim.claimId)
  if (repair === undefined) throw new Error('No repair.')
  return { itemId, rentalId: claim.rentalId, repair }
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Ribeira Repair Bikes')
  priceId = (await scoped((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  const db = await database()
  const ownerId = (await db.select().from(staffRoles)).find((row) => row.shopId === shop.shopId && row.role === 'owner')?.userId ?? ''
  const { token } = await inShop(db, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) => createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email: READER, role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()))
  const subject = await signIn(jar, READER, 'passkey')
  await acceptInvitation(db, { token, subject, email: READER, name: 'Reader', language: 'en' }, new Date())
})
beforeEach(() => { jar.clear() })

describe('closing a repair a charge opened', () => {
  it('records each line’s outcome and the cost, in the shop’s currency', async () => {
    const { repair, itemId } = await chargedRepair()
    await signIn(jar, OWNER, 'email_code')
    expect(await repairs.startRepair(null, form({ repairId: repair.id, ...locale }))).toMatchObject({ ok: true, value: { sessionId: null } })
    const fields = { repairId: repair.id, lineId: repair.lines.map((line) => line.id), outcome: repair.lines.map(() => 'repaired'), cost: '4.50', note: 'New bell fitted.', ...locale }
    expect(await repairs.finishRepair(null, form({ ...fields, cost: 'four' }))).toMatchObject({ ok: false, failure: 'refused', reason: 'cost_invalid' })
    expect(await repairs.finishRepair(null, form({ ...fields, outcome: [] }))).toMatchObject({ ok: false })
    expect(await repairs.finishRepair(null, form(fields))).toMatchObject({ ok: true })
    const done = (await scoped((transaction) => itemRepairs(transaction, itemId))).find((each) => each.id === repair.id)
    expect(done).toMatchObject({ state: 'done', costCents: 4_50, note: 'New bell fitted.' })
  })

  it('refuses someone signed out or read-only', async () => {
    const { repair } = await chargedRepair()
    const fields = { repairId: repair.id, lineId: repair.lines.map((line) => line.id), outcome: repair.lines.map(() => 'left'), cost: '0', note: '', ...locale }
    jar.clear()
    expect(await repairs.finishRepair(null, form(fields))).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, READER, 'passkey')
    expect(await repairs.finishRepair(null, form(fields))).toEqual({ ok: false, failure: 'role' })
    expect(await repairs.startRepair(null, form({ repairId: repair.id, ...locale }))).toEqual({ ok: false, failure: 'role' })
  })
})

describe('a repair staff open from the passport', () => {
  it('covers the open marks chosen, and asks for a photograph of their views', async () => {
    const { itemId, rentalId } = await chargedRepair()
    const db = await database()
    const rentalItem = (await db.select().from(rentalItems)).find((row) => row.rentalId === rentalId)
    const session = (await db.select().from(captureSessions)).find((row) => row.rentalItemId === rentalItem?.id && row.kind === 'return')
    const [mark] = await db.insert(marks).values({ shopId: shop.shopId, itemId, view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, description: 'Scuff on the chain stay', firstSeenSessionId: session?.id ?? '' }).returning()
    await signIn(jar, OWNER, 'email_code')
    expect(await repairs.openRepair(null, form({ itemId, markId: [], ...locale }))).toMatchObject({ ok: false, failure: 'refused', reason: 'marks_needed' })
    const opened = await repairs.openRepair(null, form({ itemId, markId: [mark?.id ?? ''], ...locale }))
    expect(opened).toMatchObject({ ok: true })
    if (!opened.ok) throw new Error('Not opened.')
    const started = await repairs.startRepair(null, form({ repairId: opened.value.repairId, ...locale }))
    expect(started).toMatchObject({ ok: true, value: { sessionId: expect.any(String) as unknown, itemId } })
    expect(await repairs.requestPhotoUpload(null, form({ sessionId: started.ok ? (started.value.sessionId ?? '') : '', view: 'right-side', sha256: 'a'.repeat(64), bytes: '1000', ...locale }))).toMatchObject({ ok: false, reason: 'unknown_view' })
  })
})
