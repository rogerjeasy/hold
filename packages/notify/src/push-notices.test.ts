import { RENTER_PUSH_EVENTS, RENTER_PUSH_PAGES, STAFF_PUSH_EVENTS } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { renterPush, staffPush } from './push-notices.ts'

const LANGUAGES = ['en', 'fr', 'de', 'es'] as const
const REFERENCE = 'Zk3J9q0bWb1yXc2V4n6m8A'
const SHOP_ID = '6f1c1e0e-3d2b-4c8e-9a51-2f7b5c1d9e10'
const PATH = '/shop/rental/0b0e6c1a-58c4-4c1e-8a3f-9d2c4b1a7e55'

// Every push Hold can build, in every language. A push travels through Expo, Apple and Google, so none may carry what
// would let someone act as the renter or learn about them: a link or its token, a code, an amount, an email or a phone.
const every = () => [
  ...RENTER_PUSH_EVENTS.flatMap((event) => LANGUAGES.map((language) => renterPush(event, { shopName: 'Ribeira Bikes', language, reference: REFERENCE }))),
  ...STAFF_PUSH_EVENTS.flatMap((event) => LANGUAGES.map((language) => staffPush(event, { shopName: 'Ribeira Bikes', language, shopId: SHOP_ID, path: PATH }))),
]

describe('a push notification’s words', () => {
  it('names the shop as its title and says, in the reader’s language, what happened', () => {
    expect(renterPush('claim_ready', { shopName: 'Ribeira Bikes', language: 'en', reference: REFERENCE })).toEqual({ title: 'Ribeira Bikes', body: 'Your claim is ready to read.', data: { kind: 'renter', reference: REFERENCE, page: 'claim' } })
    expect(renterPush('claim_ready', { shopName: 'Ribeira Bikes', language: 'fr', reference: REFERENCE }).body).not.toBe('Your claim is ready to read.')
    expect(staffPush('drop_off_waiting', { shopName: 'Ribeira Bikes', language: 'de', shopId: SHOP_ID, path: '/shop/drop-offs' })).toEqual({ title: 'Ribeira Bikes', body: expect.any(String) as unknown, data: { kind: 'staff', shopId: SHOP_ID, path: '/shop/drop-offs' } })
  })

  it('falls back to English for a language Hold does not write', () => {
    expect(renterPush('receipt', { shopName: 'Ribeira Bikes', language: 'pt', reference: REFERENCE }).body).toBe(renterPush('receipt', { shopName: 'Ribeira Bikes', language: 'en', reference: REFERENCE }).body)
  })

  it('opens the page of the rental each event belongs to', () => {
    for (const event of RENTER_PUSH_EVENTS) expect(renterPush(event, { shopName: 'S', language: 'en', reference: REFERENCE }).data.page).toBe(RENTER_PUSH_PAGES[event])
  })

  it('is short and written for every event and language', () => {
    for (const push of every()) {
      expect(push.body.length).toBeGreaterThan(5)
      expect(push.body.length).toBeLessThanOrEqual(120)
    }
  })

  it('carries no secret and nothing personal, in any push Hold builds', () => {
    for (const push of every()) {
      const words = `${push.title} ${push.body}`
      expect(words).not.toMatch(/https?:|\/r\/|@|\+\d|\d{4,}|[€$£]|\b(?:EUR|USD|GBP|CHF)\b/)
      // The data holds only what routes the tap: a reference with no meaning outside Hold, a page, or a counter screen.
      expect(Object.keys(push.data).sort()).toEqual(push.data.kind === 'renter' ? ['kind', 'page', 'reference'] : ['kind', 'path', 'shopId'])
      expect(JSON.stringify(push.data)).not.toMatch(/token|code|cents|email|phone|@|https?:/i)
    }
  })
})
