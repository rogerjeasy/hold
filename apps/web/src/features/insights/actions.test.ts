// @vitest-environment node
import { INSIGHTS_PROMPT_VERSION } from '@hold/agent'
import { acceptInvitation, auditLog, createInvitation, inShop, registerOwner, savedInsightsDashboard, takeRateToken } from '@hold/db'
import { INSIGHTS_DAILY_TOKENS, utcDay } from '@hold/domain'
import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

const { askInsights, saveInsightsDashboard } = await import('./actions')
const { INSIGHTS_LIMITS } = await import('./limits')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

// One turn of the insights agent (extensions.md section 12.5), asked of the server function the dashboard's adapter
// calls: owners and managers only, a turn as AG Studio sends it, and an audit line naming the model and its prompt.

const OWNER = 'owner@insights.example'
let shopId: string
let ownerId: string
const turn = JSON.stringify({ input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Which bikes cost me most?' }] }], tools: [{ name: 'execute_query', parameters: { type: 'object' } }] })

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  const registered = await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shopId = registered.shopId
  ownerId = registered.userId
  const { token } = await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId, invitedByUserId: ownerId, email: 'jonas@insights.example', role: 'counter_staff', approvalLimitCents: 0, language: 'en' }, new Date()))
  const staff = await signIn(jar, 'jonas@insights.example', 'passkey')
  await acceptInvitation(database, { token, subject: staff, email: 'jonas@insights.example', name: 'Jonas', language: 'en' }, new Date())
})

describe('asking the insights agent', () => {
  it('answers an owner from the test environment’s script, and records the model, its prompt and the calls it kept', async () => {
    await signIn(jar, OWNER, 'passkey')
    const result = await askInsights(null, form({ turn }))
    expect(result).toMatchObject({ ok: true, value: { outcome: 'answered', simulated: true, response: { status: 'completed' } } })
    const { database } = await getServices()
    const lines = (await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, (transaction) => transaction.select().from(auditLog))).filter((line) => line.action === 'insights.turn')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.detail).toMatchObject({ model: 'simulated', promptVersion: INSIGHTS_PROMPT_VERSION, kept: [], dropped: [] })
  })

  it('refuses counter staff, and a turn that is not one AG Studio sends', async () => {
    await signIn(jar, 'jonas@insights.example', 'passkey')
    expect(await askInsights(null, form({ turn }))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'passkey')
    expect(await askInsights(null, form({ turn: '{"input": "not a list"}' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await askInsights(null, form({ turn: 'not json' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })
})

describe('the shop’s daily budget for the insights agent', () => {
  it('refuses a turn once the shop’s turns of the last day have spent its tokens, and asks no model', async () => {
    const { database } = await getServices()
    await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, (transaction) =>
      transaction.insert(auditLog).values({ shopId, actorKind: 'person', actorId: ownerId, action: 'insights.turn', detail: { tokens: INSIGHTS_DAILY_TOKENS }, at: new Date() }))
    await signIn(jar, OWNER, 'passkey')
    expect(await askInsights(null, form({ turn }))).toEqual({ ok: false, failure: 'refused', reason: 'insights_budget_spent' })
  })
})

describe('one shop’s share of the day’s turns', () => {
  it('refuses a turn once this shop has taken its share of the day, and asks no model', async () => {
    const { database } = await getServices()
    while (await takeRateToken(database, INSIGHTS_LIMITS.perShop, shopId)) { /* spend the shop's share */ }
    await signIn(jar, OWNER, 'passkey')
    expect(await askInsights(null, form({ turn }))).toEqual({ ok: false, failure: 'refused', reason: 'insights_daily_cap' })
  })
})

describe('every shop’s turns together in a day', () => {
  it('refuses a turn once the day’s turns across every shop are spent, and asks no model', async () => {
    const { database } = await getServices()
    while (await takeRateToken(database, INSIGHTS_LIMITS.perDay, utcDay(new Date()))) { /* spend the day */ }
    await signIn(jar, OWNER, 'passkey')
    expect(await askInsights(null, form({ turn }))).toEqual({ ok: false, failure: 'refused', reason: 'insights_daily_cap' })
  })
})

describe('saving the shop’s own dashboard', () => {
  const state = JSON.stringify({ selectedPageId: 'overview', pages: [{ id: 'overview', widgets: {} }], panels: { ai: { collapsed: false } } })

  it('keeps the dashboard an owner leaves, with the report it was built on, for the next visit', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await saveInsightsDashboard(null, form({ state, reportVersion: '2' }))).toMatchObject({ ok: true })
    const { database } = await getServices()
    expect(await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, savedInsightsDashboard)).toMatchObject({ state: { selectedPageId: 'overview' }, reportVersion: 2 })
  })

  it('refuses counter staff, and a state that is not AG Studio’s or is too large to be one', async () => {
    await signIn(jar, 'jonas@insights.example', 'passkey')
    expect(await saveInsightsDashboard(null, form({ state, reportVersion: '2' }))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'passkey')
    expect(await saveInsightsDashboard(null, form({ state: JSON.stringify({ pages: [], selectedPageId: 'x', script: 'alert(1)' }), reportVersion: '2' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await saveInsightsDashboard(null, form({ state: JSON.stringify({ pages: [{ id: 'x'.repeat(600_000) }], selectedPageId: 'x' }), reportVersion: '2' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })
})

