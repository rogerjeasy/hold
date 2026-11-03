// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { inShop, issueRenterLink, rentalDetail } from '@hold/db'
import { verifyEvidenceStatement } from '@hold/trust/evidence-verify'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { tampered } from '@/test/tampered'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 23).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined), set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.41' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const { checkEvidence } = await import('./renter-actions')
const { getServices } = await import('@/server/services')
const { credentialKeys } = await import('@/server/clean-record')
const { form } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { inspectedRental } = await import('@/test/presented-claim')

vi.setConfig({ testTimeout: 30_000 })

let shop: Awaited<ReturnType<typeof handoverShop>>
const itemOf = async (rentalId: string) => (await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date())))?.items[0]?.id ?? ''

beforeAll(async () => {
  shop = await handoverShop(jar, 'owner@evidence-check.example', 'Evidence Bikes')
})

beforeEach(() => {
  jar.clear()
})

describe('checking the evidence from a renter’s link', () => {
  it('signs what Hold holds about the item and opens /verify with it after the #, where Hold’s published key checks it', async () => {
    const rental = await inspectedRental(jar, shop)
    jar.clear()
    const checked = await checkEvidence(null, form({ token: rental.token, itemId: await itemOf(rental.rentalId), locale: 'de' }))
    if (!checked.ok) throw new Error(JSON.stringify(checked))
    const url = new URL(checked.value.url)
    expect(url.pathname).toBe('/de/verify')
    const verified = await verifyEvidenceStatement(url.hash.slice(1), await credentialKeys(), new Date())
    if (!verified.ok) throw new Error(verified.error)
    expect(verified.value).toMatchObject({ shop: 'Evidence Bikes', intact: true, confirmed: null })
    expect(verified.value.sessions.map((session) => [session.kind, session.seal, session.link])).toEqual([['handover', 'holds', 'first'], ['return', 'holds', 'linked']])
  })

  it('finds nothing for an item that is not in the link’s rental', async () => {
    const rental = await inspectedRental(jar, shop)
    jar.clear()
    expect(await checkEvidence(null, form({ token: rental.token, itemId: randomUUID(), locale: 'en' }))).toMatchObject({ ok: false, failure: 'refused', reason: 'not_found' })
  })

  it('refuses a forged link, a link without the scope to view, and any field it does not know', async () => {
    const rental = await inspectedRental(jar, shop)
    jar.clear()
    const itemId = await itemOf(rental.rentalId)
    expect(await checkEvidence(null, form({ token: tampered(rental.token), itemId, locale: 'en' }))).toMatchObject({ ok: false, failure: 'link_invalid' })
    const { newRenterLink } = await import('@/server/renter-links')
    const limited = await newRenterLink(new Date())
    await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => issueRenterLink(transaction, shop.shopId, rental.rentalId, limited, []))
    expect(await checkEvidence(null, form({ token: limited.token, itemId, locale: 'en' }))).toMatchObject({ ok: false, failure: 'scope' })
    expect(await checkEvidence(null, form({ token: rental.token, itemId, statement: 'forged', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })
})
