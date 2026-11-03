// @vitest-environment node
import { inShop, photos, priceEntries, recordDisplayCopy } from '@hold/db'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 31).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const { getServices } = await import('@/server/services')
const { renterClaimPage } = await import('@/server/renter-claim-page')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaim } = await import('@/test/presented-claim')
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string
beforeAll(async () => {
  shop = await handoverShop(jar, 'owner@renter-claim-photos.example', 'Claim Photo Bikes')
  priceId = (await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
})
beforeEach(() => { jar.clear() })

// A line a person added by hand has no finding of its own, so it has no photograph pair. The renter still sees what
// the item looked like when it left and when it came back: the sealed handover and return photographs, view by view.
it('gives the renter the sealed handover and return photographs of each item, for lines with no photographs of their own', async () => {
  const rental = await presentedClaim(jar, shop, priceId)
  jar.clear()
  // The media worker makes each photograph's display copy; here it is recorded as the worker would.
  await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, async (transaction) => {
    for (const photo of await transaction.select().from(photos)) await recordDisplayCopy(transaction, photo.id, `display/${photo.id}.jpg`, '0'.repeat(16))
  })
  const page = await renterClaimPage(rental.claimToken, 'en')
  if (!page.ok) throw new Error(page.failure)
  expect(page.data.lines).toMatchObject([{ beforeUrl: null, afterUrl: null }])
  expect(page.data.itemPhotos).toMatchObject([{ label: expect.any(String) as string, views: [{ view: 'left-side', label: 'Left side' }, { view: 'right-side', label: 'Right side' }] }])
  for (const view of page.data.itemPhotos?.[0]?.views ?? []) {
    expect(view.beforeUrl).toEqual(expect.any(String))
    expect(view.afterUrl).toEqual(expect.any(String))
    expect(view.beforeUrl).not.toEqual(view.afterUrl)
  }
})
