// @vitest-environment node
import { acceptInvitation, createInvitation, holds, inShop, mandates, opsRules, outbox, proposals, staffRoles } from '@hold/db'
import type { TestDatabase } from '@hold/db/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 41).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined), set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))

const operations = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { default: QueuePage } = await import('@/app/[locale]/shop/queue/page')
const { QueueScreen } = await import('./queue-screen')

vi.setConfig({ testTimeout: 60_000 })

const OWNER = 'owner@queue-a.example'
const OTHER_OWNER = 'owner@queue-b.example'
const MANAGER = 'manager@queue-a.example'
const COUNTER = 'counter@queue-a.example'
const READER = 'reader@queue-a.example'
let shop: Awaited<ReturnType<typeof handoverShop>>

const database = async () => (await getServices()).database
const locale = { locale: 'en' }

// A rental whose hold PayPal ends in two days: the hold_ending detector's case.
async function holdEnding(): Promise<{ rentalId: string; holdId: string; reservedCents: number }> {
  const { rentalId } = await shop.readyRental()
  const hold = (await (await database()).select().from(holds)).find((row) => row.rentalId === rentalId)
  if (hold?.currentAuthorizationId == null) throw new Error('No hold.')
  await ((await database()) as unknown as TestDatabase).$client.query('update authorizations set valid_until = $1 where id = $2', [new Date(Date.now() + 2 * 86_400_000), hold.currentAuthorizationId])
  return { rentalId, holdId: hold.id, reservedCents: hold.reservedCents }
}

async function pendingFor(holdId: string) {
  return (await (await database()).select().from(proposals)).filter((row) => row.subjectId === holdId && row.state === 'pending')
}

async function as(email: string, factor: 'email_code' | 'passkey' = 'passkey') {
  await signIn(jar, email, factor)
}

async function join(email: string, role: 'manager' | 'counter_staff' | 'read_only') {
  const { database: db } = await getServices()
  const ownerId = (await db.select().from(staffRoles)).find((row) => row.shopId === shop.shopId && row.role === 'owner')?.userId ?? ''
  const { token } = await inShop(db, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const subject = await signIn(jar, email, 'passkey')
  await acceptInvitation(db, { token, subject, email, name: role, language: 'en' }, new Date())
}

beforeAll(async () => {
  // A second shop, whose owner must reach nothing of the first.
  await handoverShop(jar, OTHER_OWNER, 'Douro Queue Rides')
  shop = await handoverShop(jar, OWNER, 'Ribeira Queue Bikes')
  await join(MANAGER, 'manager')
  await join(COUNTER, 'counter_staff')
  await join(READER, 'read_only')
})

beforeEach(() => {
  jar.clear()
})

describe('checking now', () => {
  it('runs the operations agent for the shop, through the outbox, and fills the queue with the detector\'s fixed reason', async () => {
    const { holdId } = await holdEnding()
    await as(OWNER)
    expect(await operations.checkNow(null, form(locale))).toMatchObject({ ok: true })
    const queued = (await (await database()).select().from(outbox)).filter((row) => row.shopId === shop.shopId && row.queue === 'ops-agent')
    expect(queued.at(-1)?.payload).toEqual({ trigger: 'manual' })
    const [proposal] = await pendingFor(holdId)
    expect(proposal).toMatchObject({ kind: 'request_replacement_hold', payload: { fixedReason: 'hold_ending', investigated: 'no', paypalChecked: 'no' } })
  })

  it('shows the shop only the PayPal disputes on its own payments, though the test environment\'s PayPal serves every shop', async () => {
    ;(await getServices()).simulatedPayPal?.openDispute({ id: 'DISPUTE-ELSEWHERE', open: true, amount: { cents: 5000, currency: 'EUR' }, responseDueAt: new Date(Date.now() + 5 * 86_400_000), captureIds: ['CAPTURE-ELSEWHERE'] })
    await as(OWNER)
    expect(await operations.checkNow(null, form(locale))).toMatchObject({ ok: true })
    expect((await (await database()).select().from(proposals)).filter((row) => row.subjectId === 'DISPUTE-ELSEWHERE')).toEqual([])
  })

  it('is for owners and managers only', async () => {
    await as(MANAGER)
    expect(await operations.checkNow(null, form(locale))).toMatchObject({ ok: true })
    for (const person of [COUNTER, READER]) {
      await as(person)
      expect(await operations.checkNow(null, form(locale))).toEqual({ ok: false, failure: 'role' })
    }
  })
})

describe('the queue page', () => {
  it('shows each amount as the database holds it, and controls only to those who may decide (X1.10)', async () => {
    const { holdId, reservedCents } = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const page = await QueuePage()
    expect(page.type).toBe(QueueScreen)
    const entry = (page.props as { entries: { subjectId: string; amountCents: number | null; currency: string | null }[] }).entries.find((each) => each.subjectId === holdId)
    expect(entry).toMatchObject({ amountCents: reservedCents, currency: 'EUR' })
    expect(page.props).toMatchObject({ canDecide: true, isOwner: true })
    await as(COUNTER)
    expect((await QueuePage()).props).toMatchObject({ canDecide: false, isOwner: false })
    await as(OTHER_OWNER)
    expect((await QueuePage()).props).toMatchObject({ entries: [] })
  })
})

describe('deciding an entry', () => {
  it('refuses a proposal whose hold has already been released as superseded, and keeps that outcome (X1.5)', async () => {
    const { holdId } = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const [proposal] = await pendingFor(holdId)
    await ((await database()) as unknown as TestDatabase).$client.query("update holds set state = 'released' where id = $1", [holdId])
    expect(await operations.approveProposals(null, form({ proposalId: proposal?.id ?? '', ...locale }))).toMatchObject({ ok: true, value: { outcomes: [{ proposalId: proposal?.id, ok: false, reason: 'superseded' }] } })
    expect((await (await database()).select().from(proposals)).find((row) => row.id === proposal?.id)?.state).toBe('superseded')
  })

  it('asks for the passkey before approving what moves money, then asks the renter for a replacement hold', async () => {
    const { holdId } = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const [proposal] = await pendingFor(holdId)
    const approve = form({ proposalId: proposal?.id ?? '', ...locale })
    await as(OWNER, 'email_code')
    expect(await operations.approveProposals(null, approve)).toEqual({ ok: false, failure: 'refused', reason: 'passkey_needed' })
    await as(OWNER)
    expect(await operations.approveProposals(null, approve)).toMatchObject({ ok: true, value: { outcomes: [{ proposalId: proposal?.id, ok: true, state: 'executed' }] } })
    expect((await (await database()).select().from(holds)).find((row) => row.id === holdId)?.replacementOrderId).not.toBeNull()
  })

  it('approves several entries together only when every one is a release', async () => {
    const first = await holdEnding()
    const second = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const ids = [...(await pendingFor(first.holdId)), ...(await pendingFor(second.holdId))].map((row) => row.id)
    expect(await operations.approveProposals(null, form({ proposalId: ids, ...locale }))).toEqual({ ok: false, failure: 'refused', reason: 'not_together' })
    expect(await pendingFor(first.holdId)).toHaveLength(1)
  })

  it('refuses counter staff, read-only members, another shop and a decided proposal', async () => {
    const { holdId } = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const [proposal] = await pendingFor(holdId)
    const id = { proposalId: proposal?.id ?? '', ...locale }
    for (const person of [COUNTER, READER]) {
      await as(person)
      expect(await operations.approveProposals(null, form(id))).toEqual({ ok: false, failure: 'role' })
      expect(await operations.rejectProposal(null, form({ ...id, reason: 'No.' }))).toEqual({ ok: false, failure: 'role' })
      expect(await operations.postponeProposal(null, form(id))).toEqual({ ok: false, failure: 'role' })
    }
    await as(OTHER_OWNER)
    expect(await operations.approveProposals(null, form(id))).toEqual({ ok: false, failure: 'refused', reason: 'not_found' })
    expect(await operations.rejectProposal(null, form({ ...id, reason: 'Not mine.' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_found' })
    await as(MANAGER)
    expect(await operations.postponeProposal(null, form(id))).toEqual({ ok: true, value: { proposalId: proposal?.id } })
    expect(await pendingFor(holdId)).toHaveLength(1)
    const { recent } = (await QueuePage()).props as { recent: { id: string; state: string }[] }
    expect(recent.find((each) => each.id === proposal?.id)?.state).toBe('pending')
    await ((await database()) as unknown as TestDatabase).$client.query("update proposals set state = 'rejected' where id = $1", [proposal?.id])
    expect(await operations.rejectProposal(null, form({ ...id, reason: 'Again.' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_pending' })
  })
})

describe('learning from a rejection (X1.9)', () => {
  it('drafts a rule from a rejection with a reason; once the owner confirms it, the next run does not make that proposal', async () => {
    const { holdId } = await holdEnding()
    await as(OWNER)
    await operations.checkNow(null, form(locale))
    const [proposal] = await pendingFor(holdId)
    const id = { proposalId: proposal?.id ?? '', ...locale }
    expect(await operations.rejectProposal(null, form({ ...id, reason: ' ' }))).toMatchObject({ ok: false, failure: 'invalid' })
    const rejected = await operations.rejectProposal(null, form({ ...id, reason: 'This renter always renews in person.' }))
    if (!rejected.ok) throw new Error(JSON.stringify(rejected))
    const drafted = (await (await database()).select().from(opsRules)).find((row) => row.id === rejected.value.ruleId)
    expect(drafted).toMatchObject({ state: 'drafted', fromProposalId: proposal?.id, rule: { kind: 'never', proposalKind: 'request_replacement_hold' } })
    const page = await QueuePage()
    expect(page.props).toMatchObject({ rules: [expect.objectContaining({ id: rejected.value.ruleId, state: 'drafted', suggestedCents: 30000 })] })

    await as(MANAGER)
    expect(await operations.confirmRule(null, form({ ruleId: rejected.value.ruleId, shape: 'never', amount: '', ...locale }))).toEqual({ ok: false, failure: 'role' })
    await as(OWNER)
    expect(await operations.confirmRule(null, form({ ruleId: rejected.value.ruleId, shape: 'below_amount', amount: 'lots', ...locale }))).toEqual({ ok: false, failure: 'refused', reason: 'amount_invalid' })
    expect(await operations.confirmRule(null, form({ ruleId: rejected.value.ruleId, shape: 'never', amount: '', ...locale }))).toMatchObject({ ok: true })

    const next = await holdEnding()
    expect(await operations.checkNow(null, form(locale))).toMatchObject({ ok: true })
    expect(await pendingFor(next.holdId)).toEqual([])

    const confirmed = (await (await database()).select().from(opsRules)).find((row) => row.shopId === shop.shopId && row.state === 'confirmed')
    await as(COUNTER)
    expect(await operations.discardRule(null, form({ ruleId: confirmed?.id ?? '', ...locale }))).toEqual({ ok: false, failure: 'role' })
    await as(OWNER)
    expect(await operations.discardRule(null, form({ ruleId: confirmed?.id ?? '', ...locale }))).toMatchObject({ ok: true })
    expect(await operations.checkNow(null, form(locale))).toMatchObject({ ok: true })
    expect(await pendingFor(next.holdId)).toHaveLength(1)
  })
})

describe('the standing rule', () => {
  it('is granted by the owner with a passkey, within its limits, and revoked by the owner', async () => {
    const limits = { dailyCount: '3', days: '30', ...locale }
    await as(OWNER, 'email_code')
    expect(await operations.grantStandingRule(null, form(limits))).toEqual({ ok: false, failure: 'passkey_needed' })
    await as(MANAGER)
    expect(await operations.grantStandingRule(null, form(limits))).toEqual({ ok: false, failure: 'role' })
    await as(OWNER)
    expect(await operations.grantStandingRule(null, form({ ...limits, dailyCount: '21' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await operations.grantStandingRule(null, form({ ...limits, days: '91' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await operations.grantStandingRule(null, form(limits))).toMatchObject({ ok: true })
    expect(await operations.grantStandingRule(null, form({ ...limits, dailyCount: '5' }))).toMatchObject({ ok: true })
    const live = (await (await database()).select().from(mandates)).filter((row) => row.shopId === shop.shopId && row.revokedAt === null)
    expect(live).toHaveLength(1)
    expect(live[0]?.limits).toMatchObject({ dailyCount: 5 })
    expect((await QueuePage()).props).toMatchObject({ standingRule: { id: live[0]?.id } })
    await as(MANAGER)
    expect(await operations.revokeStandingRule(null, form(locale))).toEqual({ ok: false, failure: 'role' })
    await as(OWNER)
    expect(await operations.revokeStandingRule(null, form(locale))).toMatchObject({ ok: true })
    expect((await QueuePage()).props).toMatchObject({ standingRule: undefined })
  })
})

describe('checking too often', () => {
  it('is limited for the shop', async () => {
    await as(OWNER)
    const answers = []
    for (let attempt = 0; attempt < 14; attempt += 1) answers.push(await operations.checkNow(null, form(locale)))
    expect(answers).toContainEqual({ ok: false, failure: 'rate_limited' })
  })
})
