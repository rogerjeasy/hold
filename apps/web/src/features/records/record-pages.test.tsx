// @vitest-environment node
import { claims, inShop, rentals, reserveEvidencePack, staffRoles } from '@hold/db'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import StaffPage from '@/app/[locale]/shop/rentals/[rentalId]/record/page'
import RenterPage from '@/app/[locale]/(link)/r/[token]/record/page'
import { EvidenceRecordScreen } from './evidence-record-screen'
import { LinkRefused } from '@/features/renter/link-refused'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 23).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next/navigation', async (original) => ({ ...(await original<object>()), notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))
const { getServices } = await import('@/server/services')
const { signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const owner = 'owner@record-pages.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
let rental: { rentalId: string; token: string }
let firstId: string
let secondId: string
beforeAll(async () => {
  shop = await handoverShop(jar, owner, 'Shared Record Bikes')
  rental = await shop.readyRental()
  const { database } = await getServices()
  const packs = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, async (transaction) => {
    const first = await reserveEvidencePack(transaction, rental.rentalId, new Date())
    await transaction.update(rentals).set({ conditionReply: 'confirmed', conditionRepliedAt: new Date() })
    const second = await reserveEvidencePack(transaction, rental.rentalId, new Date())
    return { first, second }
  })
  if (packs.first === undefined || packs.second === undefined) throw new Error('Missing record fixtures')
  firstId = packs.first.id; secondId = packs.second.id
})
beforeEach(() => { jar.clear() })

it('loads the exact requested staff version instead of silently showing the latest', async () => {
  await signIn(jar, owner, 'email_code')
  const page = await StaffPage({ params: Promise.resolve({ rentalId: rental.rentalId }), searchParams: Promise.resolve({ version: firstId }) })
  expect(page).toMatchObject({ type: EvidenceRecordScreen, props: { canBuild: true, versions: [{ id: firstId, version: 1 }] } })
})

it('rejects malformed or missing selected versions for staff', async () => {
  await signIn(jar, owner, 'email_code')
  for (const version of ['latest', '00000000-0000-4000-8000-000000000099']) {
    await expect(StaffPage({ params: Promise.resolve({ rentalId: rental.rentalId }), searchParams: Promise.resolve({ version }) })).rejects.toThrow('NOT_FOUND')
  }
})

it('loads exact shared versions for renters and refuses unknown or malformed selections', async () => {
  const page = await RenterPage({ params: Promise.resolve({ token: rental.token }), searchParams: Promise.resolve({ version: firstId }) })
  expect(page).toMatchObject({ type: EvidenceRecordScreen, props: { token: rental.token, versions: [{ id: firstId, version: 1 }] } })
  for (const version of ['latest', '00000000-0000-4000-8000-000000000099']) {
    expect(await RenterPage({ params: Promise.resolve({ token: rental.token }), searchParams: Promise.resolve({ version }) })).toMatchObject({ type: LinkRefused, props: { failure: 'link_invalid' } })
  }
})

it('rejects unknown query fields and repeated version selections for both actors', async () => {
  await signIn(jar, owner, 'email_code')
  for (const query of [{ version: firstId, unexpected: 'untrusted' }, { version: [firstId, secondId] }]) {
    await expect(StaffPage({ params: Promise.resolve({ rentalId: rental.rentalId }), searchParams: Promise.resolve(query) })).rejects.toThrow('NOT_FOUND')
    expect(await RenterPage({ params: Promise.resolve({ token: rental.token }), searchParams: Promise.resolve(query) })).toMatchObject({ type: LinkRefused, props: { failure: 'link_invalid' } })
  }
})

it('hides a draft claim version from renters while preserving earlier shared records', async () => {
  const { database } = await getServices()
  const draft = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, async (transaction) => {
    await transaction.insert(claims).values({ shopId: shop.shopId, rentalId: rental.rentalId, currency: 'EUR' })
    return reserveEvidencePack(transaction, rental.rentalId, new Date())
  })
  if (draft === undefined) throw new Error('Missing draft fixture')
  expect(await RenterPage({ params: Promise.resolve({ token: rental.token }), searchParams: Promise.resolve({ version: draft.id }) })).toMatchObject({ type: LinkRefused })
  const page = await RenterPage({ params: Promise.resolve({ token: rental.token }), searchParams: Promise.resolve({}) })
  expect(page).toMatchObject({ props: { versions: [{ id: secondId }, { id: firstId }] } })
})

it('renders read-only staff with downloads and no document preparation controls', async () => {
  await signIn(jar, owner, 'email_code')
  const { database } = await getServices()
  await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.update(staffRoles).set({ role: 'read_only' }))
  const page = await StaffPage({ params: Promise.resolve({ rentalId: rental.rentalId }), searchParams: Promise.resolve({}) })
  expect(page).toMatchObject({ props: { canBuild: false } })
})
