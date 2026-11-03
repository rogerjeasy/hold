// @vitest-environment node
import { inShop, openDemoSession, outbox } from '@hold/db'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 17).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))
vi.setConfig({ testTimeout: 60_000 })
const operations = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { default: QueuePage } = await import('@/app/[locale]/shop/queue/page')

// A judge asks the operations agent to investigate the demo's two sample entries (extensions.md section 6.14). In the
// test environment no model is reached, so the run finishes and says Claude did not answer; on AWS it is Claude.
const locale = { locale: 'en' }
let count = 0
async function demo(slug: string) {
  count += 1
  const owner = `tomas-${slug}@sample-investigation.example`
  const staff = `jonas-${slug}@sample-investigation.example`
  const { database } = await getServices()
  const opened = await openDemoSession(database, { owner: { subject: await signIn(jar, owner, 'passkey'), email: owner }, staff: { subject: await signIn(jar, staff, 'passkey'), email: staff }, slug: `ribeira-bikes-investigate-${slug}-${String(count)}`, paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: new Date() })
  return { shopId: opened.shopId, owner, staff }
}
const samples = async () => (await QueuePage()).props as { samples: { waiting: number; status: { state: string; investigated: number } | undefined } }

let first: Awaited<ReturnType<typeof demo>>
beforeAll(async () => { first = await demo('first') })
beforeEach(() => { jar.clear() })

describe('investigating the demo\'s samples', () => {
  it('is for the owner or a manager only', async () => {
    await signIn(jar, first.staff, 'email_code')
    expect(await operations.investigateSamples(null, form(locale))).toEqual({ ok: false, failure: 'role' })
  })

  it('runs the operations agent over the sample entries through the ops-agent queue, and the page says how it ended', async () => {
    await signIn(jar, first.owner, 'email_code')
    expect(await samples()).toMatchObject({ samples: { waiting: 2, status: undefined } })
    expect(await operations.investigateSamples(null, form(locale))).toMatchObject({ ok: true })
    const { database } = await getServices()
    const queued = await inShop(database, { role: 'hold_app', shopId: first.shopId }, (transaction) => transaction.select().from(outbox))
    expect(queued.filter((row) => row.queue === 'ops-agent').map((row) => Object.keys(row.payload).sort())).toContainEqual(['samplesRunId', 'trigger'])
    expect(await samples()).toMatchObject({ samples: { waiting: 2, status: { state: 'completed', investigated: 0 } } })
  })

  it('lets one demo ask once a day', async () => {
    await signIn(jar, first.owner, 'email_code')
    expect(await operations.investigateSamples(null, form(locale))).toEqual({ ok: false, failure: 'refused', reason: 'samples_daily_cap' })
  })

  it('lets one network ask once a day, whichever demos it starts', async () => {
    const second = await demo('second')
    await signIn(jar, second.owner, 'email_code')
    expect(await operations.investigateSamples(null, form(locale))).toEqual({ ok: false, failure: 'refused', reason: 'samples_daily_cap' })
  })
})
