// @vitest-environment node
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import AssistantPage from '@/app/[locale]/(link)/r/[token]/assistant/page'
import ClaimPage from '@/app/[locale]/(link)/r/[token]/claim/page'
import ConditionPage from '@/app/[locale]/(link)/r/[token]/condition/page'
import NegotiationPage from '@/app/[locale]/(link)/r/[token]/negotiation/page'
import { LinkRefused } from './link-refused'
import { LinkUnavailable } from './link-unavailable'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 29).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('en'), getTranslations: () => Promise.resolve((key: string) => key) }))
const { handoverShop } = await import('@/test/ready-rental')
let rental: { rentalId: string; token: string }
beforeAll(async () => {
  const shop = await handoverShop(jar, 'owner@renter-link-pages.example', 'Link Page Bikes')
  rental = await shop.readyRental()
})
beforeEach(() => { jar.clear() })
const params = (token: string) => ({ params: Promise.resolve({ token }) })
const CHANGED = 'A'.repeat(65)

it('tells the holder of a working link that their rental has no assistant, and leads back to the rental', async () => {
  expect(await AssistantPage(params(rental.token))).toMatchObject({ type: LinkUnavailable, props: { token: rental.token, reason: 'no_assistant' } })
})

it('tells them no advocate is arguing their claim yet, instead of calling the link broken', async () => {
  expect(await NegotiationPage(params(rental.token))).toMatchObject({ type: LinkUnavailable, props: { token: rental.token, reason: 'no_negotiation' } })
})

it('tells them there is no claim to review, when none was approved', async () => {
  expect(await ClaimPage(params(rental.token))).toMatchObject({ type: LinkUnavailable, props: { token: rental.token, reason: 'no_claim' } })
})

it('tells them the handover photographs come once they collect, before the handover', async () => {
  expect(await ConditionPage(params(rental.token))).toMatchObject({ type: LinkUnavailable, props: { token: rental.token, reason: 'not_handed_over' } })
})

it('keeps the same answer for every link that truly cannot be used', async () => {
  for (const Page of [AssistantPage, NegotiationPage, ClaimPage, ConditionPage]) expect(await Page(params(CHANGED))).toMatchObject({ type: LinkRefused, props: { failure: 'link_invalid' } })
})

// Every page a renter opens from their link carries the renter's frame: the wordmark, the language, the theme, the
// skip link's target and the footer. It comes from the (link) group's layout, so no renter page may live outside it.
it('serves every page under a renter link inside the renter frame', () => {
  const app = join(import.meta.dirname, '../../app/[locale]')
  const pages = (folder: string): string[] => readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? pages(path) : name === 'page.tsx' ? [relative(app, path)] : []
  })
  const renter = pages(app).filter((path) => path.split('/').includes('r'))
  expect(renter.length).toBeGreaterThan(10)
  expect(renter.filter((path) => !path.startsWith('(link)/'))).toEqual([])
})
