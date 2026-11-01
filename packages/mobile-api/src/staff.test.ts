import { describe, expect, it } from 'vitest'
import { SHOP_HEADER, staffApi, staffSessionApi } from './staff'

// The phone's typed clients: what they send, and how they read the shared envelope.

type Sent = { url: string; init: RequestInit | undefined }

function recording(reply: unknown) {
  const sent: Sent[] = []
  const fetch = (url: string, init?: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(Response.json(reply))
  }
  return { sent, fetch }
}

const SESSION = '0b6f1f6e-1d7a-4a39-9d3e-2f8c4a1b5c6d'
const SHOP = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('the staff client', () => {
  it('names the person and the shop on every request, and sends the locale with each action', async () => {
    const { sent, fetch } = recording({ ok: true, value: { sessionId: SESSION } })
    const api = staffApi({ baseUrl: 'https://hold.test', fetch, accessToken: 'token-1', shopId: SHOP, locale: 'pt' })
    expect(await api.act('start-handover', { rentalId: SESSION, itemId: SESSION })).toEqual({ ok: true, value: { sessionId: SESSION } })
    expect(sent[0]?.url).toBe('https://hold.test/api/mobile/v1/shop/actions/start-handover')
    const headers = new Headers(sent[0]?.init?.headers)
    expect(headers.get('authorization')).toBe('Bearer token-1')
    expect(headers.get(SHOP_HEADER)).toBe(SHOP)
    expect(JSON.parse(typeof sent[0]?.init?.body === 'string' ? sent[0].init.body : '')).toEqual({ rentalId: SESSION, itemId: SESSION, locale: 'pt' })
  })

  it('reads a refusal the same way everywhere, and refuses an answer outside the contract', async () => {
    const refused = staffApi({ baseUrl: '', fetch: recording({ ok: false, failure: 'role' }).fetch, accessToken: 't', shopId: SHOP, locale: 'en' })
    expect(await refused.today()).toEqual({ ok: false, failure: 'role' })
    const odd = staffApi({ baseUrl: '', fetch: recording({ ok: true, value: { anything: 1 } }).fetch, accessToken: 't', shopId: SHOP, locale: 'en' })
    await expect(odd.today()).rejects.toThrow()
  })

  it('searches rentals with the words in the address', async () => {
    const { sent, fetch } = recording({ ok: true, value: { rentals: [] } })
    await staffApi({ baseUrl: '', fetch, accessToken: 't', shopId: SHOP, locale: 'en' }).rentals({ q: 'Priya & co' })
    expect(sent[0]?.url).toBe('/api/mobile/v1/shop/rentals?q=Priya%20%26%20co')
  })
})

describe('the session client', () => {
  it('posts JSON with no token, and asks who the bearer is with one', async () => {
    const { sent, fetch } = recording({ ok: true, value: { attempt: 'sealed', expiresAt: '2026-11-01T10:00:00.000Z' } })
    const session = staffSessionApi({ baseUrl: 'https://hold.test', fetch })
    expect(await session.start({ email: 'ana@example.com', locale: 'en' })).toMatchObject({ ok: true })
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBeNull()
    await session.me('token-2').catch(() => undefined)
    expect(new Headers(sent[1]?.init?.headers).get('authorization')).toBe('Bearer token-2')
  })
})
