// @vitest-environment node
import { createFakeIdentity } from '@hold/auth'
import type { DemoAccounts, FakeIdentity } from '@hold/auth'
import { takeRateToken } from '@hold/db'
import type { Database } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAsDemo } from './demo-sign-in'
import type { DemoDependencies } from './demo-sign-in'
import { LIMITS } from './sign-in-flow'

vi.setConfig({ testTimeout: 30_000 })

const ACCOUNTS: DemoAccounts = {
  owner: { email: 'tomas.demo@hold.example', password: 'owner-password-Aa1!' },
  staff: { email: 'jonas.demo@hold.example', password: 'staff-password-Aa1!' },
}

let database: Database
let identity: FakeIdentity
let demo: DemoDependencies
let run = 0

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => {
  run += 1
  const thisRun = run
  identity = createFakeIdentity()
  identity.addDemoAccount(ACCOUNTS.owner.email, ACCOUNTS.owner.password)
  identity.addDemoAccount(ACCOUNTS.staff.email, ACCOUNTS.staff.password)
  demo = { identity, allow: (limit, subject) => takeRateToken(database, limit, `${String(thisRun)}:${subject}`), demoAccounts: () => Promise.resolve(ACCOUNTS) }
})

async function subjectSignedIn(result: Awaited<ReturnType<typeof signInAsDemo>>): Promise<string> {
  if (!result.ok) throw new Error(`Expected to be signed in, got ${result.notice}.`)
  const verified = await identity.verifyAccessToken(result.tokens.accessToken)
  if (!verified.ok) throw new Error('The token did not verify.')
  return verified.value.subject
}

describe('signing in to a demo account', () => {
  it('signs a judge in as the demo owner or the demo counter staff, with no code', async () => {
    const owner = await subjectSignedIn(await signInAsDemo(demo, 'owner', { network: 'judge' }))
    const staff = await subjectSignedIn(await signInAsDemo(demo, 'staff', { network: 'judge' }))

    expect(owner).not.toBe(staff)
    expect(identity.lastCodeFor(ACCOUNTS.owner.email)).toBeUndefined()
  })

  it('is closed where no demo accounts are set, as on any deployment but the demo', async () => {
    expect(await signInAsDemo({ ...demo, demoAccounts: () => Promise.resolve(undefined) }, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'unavailable' })
  })

  it('says the demo is unavailable when the identity service refuses the account', async () => {
    const stale = { ...ACCOUNTS, owner: { ...ACCOUNTS.owner, password: 'changed-since' } }

    expect(await signInAsDemo({ ...demo, demoAccounts: () => Promise.resolve(stale) }, 'owner', { network: 'judge' })).toEqual({ ok: false, notice: 'unavailable' })
  })

  it('counts against the per-network limit, like any other sign-in', async () => {
    for (let index = 0; index < LIMITS.requestsPerNetwork.max; index += 1) await signInAsDemo(demo, 'staff', { network: 'busy-network' })

    expect(await signInAsDemo(demo, 'staff', { network: 'busy-network' })).toEqual({ ok: false, notice: 'busy' })
  })
})
