// @vitest-environment node
import { createFakeIdentity } from '@hold/auth'
import type { FakeIdentity } from '@hold/auth'
import { demoSessionLive, findPerson, openDemoSession, retireDemoSession, takeRateToken } from '@hold/db'
import type { Database } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { continueDemo, startDemo } from './demo-session'
import type { DemoDependencies, DemoSession } from './demo-session'
import { DEMO_LIMITS } from './demo-session'

vi.setConfig({ testTimeout: 60_000 })

const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: Database
let identity: FakeIdentity
let demo: DemoDependencies
let created: string[]
let run = 0

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => {
  run += 1
  const thisRun = run
  let codes = 0
  created = []
  identity = createFakeIdentity()
  demo = {
    identity,
    allow: (limit, subject) => takeRateToken(database, limit, `${String(thisRun)}:${subject}`),
    sessions: {
      accounts: {
        create: (account) => {
          created.push(account.email)
          return Promise.resolve(identity.addDemoAccount(account.email, account.password))
        },
      },
      open: (input) => openDemoSession(database, input),
      paypal: () => Promise.resolve(PAYPAL),
      live: (shopId) => demoSessionLive(database, shopId),
    },
    newCode: () => `r${String(thisRun)}c${String((codes += 1))}`,
    now: () => new Date('2026-12-01T09:00:00Z'),
  }
})

async function subjectOf(result: { readonly ok: true; readonly tokens: { readonly accessToken: string } } | { readonly ok: false; readonly notice: string }): Promise<string> {
  if (!result.ok) throw new Error(`Expected to be signed in, got ${result.notice}.`)
  const verified = await identity.verifyAccessToken(result.tokens.accessToken)
  if (!verified.ok) throw new Error('The token did not verify.')
  return verified.value.subject
}

async function started(key: 'owner' | 'staff', network = 'judge'): Promise<{ subject: string; session: DemoSession }> {
  const result = await startDemo(demo, key, { network })
  if (!result.ok) throw new Error(`Expected a demo, got ${result.notice}.`)
  return { subject: await subjectOf(result), session: result.session }
}

describe('starting a demo', () => {
  it('opens a shop of the judge’s own, with new accounts on the demo’s domain, and signs them in as its owner with no code', async () => {
    const { subject, session } = await started('owner')

    expect(session.owner.email).toMatch(/^tomas\.[a-z0-9]+@demo\.hold\.example$/)
    expect(session.staff.email).toMatch(/^jonas\.[a-z0-9]+@demo\.hold\.example$/)
    expect((await findPerson(database, subject))?.shops).toEqual([{ shopId: session.shopId, name: 'Ribeira Bikes', role: 'owner' }])
    expect(identity.lastCodeFor(session.owner.email)).toBeUndefined()
  })

  it('signs the judge in as the counter staff of their new shop when they start as Jonas', async () => {
    const { subject, session } = await started('staff')

    expect((await findPerson(database, subject))?.shops).toEqual([{ shopId: session.shopId, name: 'Ribeira Bikes', role: 'counter_staff' }])
  })

  it('starts fresh every time: a new shop and new accounts, never another judge’s', async () => {
    const first = await started('owner')
    const second = await started('owner')

    expect(second.session.shopId).not.toBe(first.session.shopId)
    expect(second.session.owner.email).not.toBe(first.session.owner.email)
    expect((await findPerson(database, second.subject))?.shops.map((shop) => shop.shopId)).toEqual([second.session.shopId])
  })

  it('is closed where demo mode is off, and makes nothing', async () => {
    expect(await startDemo({ ...demo, sessions: undefined }, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'unavailable' })
    expect(created).toEqual([])
  })

  it('says the demo is unavailable when an account cannot be made, and logs no address or password', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failing = { ...demo, sessions: demo.sessions && { ...demo.sessions, accounts: { create: () => Promise.reject(new Error('Cognito is down')) } } }

    expect(await startDemo(failing, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'unavailable' })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('@demo.hold.example')
    warn.mockRestore()
  })

  it('limits how many demos one network starts, since each makes accounts and a shop', async () => {
    for (let index = 0; index < DEMO_LIMITS.startsPerNetwork.max; index += 1) await started('owner', 'busy-network')
    const before = created.length

    expect(await startDemo(demo, 'owner', { network: 'busy-network' })).toEqual({ ok: false, notice: 'busy' })
    expect(created.length).toBe(before)
  })

  it('counts starts from an unknown network together, against the same limit a network has', async () => {
    for (let index = 0; index < DEMO_LIMITS.startsPerNetwork.max; index += 1) {
      const result = await startDemo(demo, 'owner', { network: undefined })
      expect(result.ok).toBe(true)
    }
    const before = created.length
    expect(await startDemo(demo, 'owner', { network: undefined })).toEqual({ ok: false, notice: 'busy' })
    expect(created.length).toBe(before)
  })

  it('counts every network’s starts against one cap for the day, in UTC', async () => {
    const asked: { name: string; subject: string }[] = []
    const counting = {
      ...demo,
      allow: (limit: { name: string }, subject: string) => {
        asked.push({ name: limit.name, subject })
        return Promise.resolve(true)
      },
    }

    await startDemo(counting, 'owner', { network: 'first-network' })
    await startDemo(counting, 'owner', { network: 'second-network' })
    await startDemo(counting, 'owner', { network: undefined })

    expect(asked.filter((each) => each.name === DEMO_LIMITS.startsPerDay.name).map((each) => each.subject)).toEqual(['2026-12-01', '2026-12-01', '2026-12-01'])
    expect(DEMO_LIMITS.startsPerDay).toEqual({ name: 'demo_starts_per_day', max: 100, windowSeconds: 24 * 60 * 60 })
  })

  it('says plainly that today’s demos are all taken once the day’s cap is reached, and makes nothing', async () => {
    const capped = { ...demo, allow: (limit: { name: string }) => Promise.resolve(limit.name !== DEMO_LIMITS.startsPerDay.name) }

    expect(await startDemo(capped, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'demo_cap' })
    expect(await startDemo(capped, 'staff', { network: undefined })).toEqual({ ok: false, notice: 'demo_cap' })
    expect(created).toEqual([])
  })
})

describe('continuing a demo', () => {
  it('signs the same browser in as the other person of the same demo, in the same shop', async () => {
    const { session } = await started('owner')

    const staff = await subjectOf(await continueDemo(demo, session, 'staff', { network: 'judge' }))

    expect((await findPerson(database, staff))?.shops).toEqual([{ shopId: session.shopId, name: 'Ribeira Bikes', role: 'counter_staff' }])
  })

  it('says the demo is unavailable when its accounts no longer accept the sealed password', async () => {
    const { session } = await started('owner')

    expect(await continueDemo(demo, { ...session, staff: { ...session.staff, password: 'changed-since-Aa1!' } }, 'staff', { network: 'judge' })).toEqual({ ok: false, notice: 'unavailable' })
  })

  it('refuses a demo that was retired after its week, and says so, before its accounts are asked', async () => {
    const { session } = await started('owner')
    const signIn = vi.spyOn(identity, 'signInWithPassword')
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(await retireDemoSession(database, { shopId: session.shopId, cutoff: new Date(later.getTime() - 7 * 24 * 60 * 60 * 1000), now: later })).toBe(true)

    expect(await continueDemo(demo, session, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'demo_ended' })
    expect(signIn).not.toHaveBeenCalled()
  })
})
