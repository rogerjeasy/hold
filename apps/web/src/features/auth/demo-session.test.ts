// @vitest-environment node
import { createFakeIdentity } from '@hold/auth'
import type { FakeIdentity } from '@hold/auth'
import { findPerson, openDemoSession, takeRateToken } from '@hold/db'
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
})
