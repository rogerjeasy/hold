import { describe, expect, it } from 'vitest'
import { paypalReturnLink, paypalReturnSchema, renterActions, renterApi } from './index'

// The phone's renter client, against a fetch that records what it was sent and answers as told.
function recording(answer: () => Promise<Response>) {
  const sent: { url: string; init: RequestInit | undefined }[] = []
  const fetch = (url: string, init?: RequestInit) => {
    sent.push({ url, init })
    return answer()
  }
  return { sent, api: renterApi({ baseUrl: 'https://hold.test', token: 'renter-token', locale: 'fr', fetch }) }
}

const answering = (body: unknown) => () => Promise.resolve(Response.json(body))

describe('the renter client', () => {
  it('sends an action as JSON with the link token as its bearer and the language, and reads the answer', async () => {
    const { sent, api } = recording(answering({ ok: true, value: { state: 'booked' } }))
    expect(await api.act('confirm-fee', { orderId: 'ORDER-1' })).toEqual({ ok: true, value: { state: 'booked' } })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://hold.test/api/mobile/v1/renter/actions/confirm-fee')
    expect(sent[0]?.init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer renter-token', 'accept-language': 'fr', 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'ORDER-1' }) })
  })

  it('checks the input with the server’s schema before sending anything', async () => {
    const { sent, api } = recording(answering({ ok: true, value: {} }))
    // A field the schema does not know, as an untyped caller could send.
    const extra = { code: '12345678', amountCents: 1 } as unknown as { code: string }
    expect(await api.act('accept-claim', extra)).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await api.act('accept-claim', { code: '1234' })).toEqual({ ok: false, failure: 'invalid', fields: ['code'] })
    expect(sent).toEqual([])
  })

  it('passes a refusal through as the server worded it', async () => {
    const { api } = recording(answering({ ok: false, failure: 'refused', reason: 'not_approved' }))
    expect(await api.act('confirm-hold', { orderId: 'ORDER-2' })).toEqual({ ok: false, failure: 'refused', reason: 'not_approved' })
  })

  it('reads an unreachable server, or an answer of another shape, as unavailable', async () => {
    expect(await recording(() => Promise.reject(new Error('offline'))).api.view('rental')).toEqual({ ok: false, failure: 'unavailable' })
    expect(await recording(answering({ ok: true, value: { shopName: 7 } })).api.view('incidents')).toEqual({ ok: false, failure: 'unavailable' })
    expect(await recording(() => Promise.resolve(new Response('<html>', { status: 502 }))).api.act('send-claim-code', { via: 'chosen' })).toEqual({ ok: false, failure: 'unavailable' })
  })

  it('reads a screen by its name and keeps only the fields the contract names', async () => {
    const { sent, api } = recording(answering({ ok: true, value: { shopName: 'Douro Bikes', open: true, items: [{ itemId: 'i', label: 'E-bike', serial: 'kept off' }], earlier: [] } }))
    expect(await api.view('incidents')).toEqual({ ok: true, value: { shopName: 'Douro Bikes', open: true, items: [{ itemId: 'i', label: 'E-bike' }], earlier: [] } })
    expect(sent[0]).toMatchObject({ url: 'https://hold.test/api/mobile/v1/renter/incidents', init: { method: 'GET', headers: { authorization: 'Bearer renter-token' } } })
  })

  it('reads one incident by its id', async () => {
    const { sent, api } = recording(answering({ ok: false, failure: 'not_found' }))
    expect(await api.incident('a/b')).toEqual({ ok: false, failure: 'not_found' })
    expect(sent[0]?.url).toBe('https://hold.test/api/mobile/v1/renter/incident/a%2Fb')
  })
})

describe('the renter contract', () => {
  it('takes no amount the server trusts: the only amount a renter writes is the advocate’s highest total', () => {
    const amountFields = Object.entries(renterActions).flatMap(([name, action]) => Object.keys(action.input.shape).filter((field) => /amount|cents|price|total|highest/i.test(field)).map((field) => `${name}.${field}`))
    expect(amountFields).toEqual(['start-advocate.highest'])
  })

  it('takes neither the token nor the language as a field, since they travel beside the form', () => {
    for (const action of Object.values(renterActions)) {
      expect(Object.keys(action.input.shape)).not.toContain('token')
      expect(Object.keys(action.input.shape)).not.toContain('locale')
    }
  })
})

describe('the way back from PayPal', () => {
  it('is the app’s own address, naming the payment and PayPal’s order, read back by the same contract', () => {
    const link = paypalReturnLink('fee', '5O190127TN364715T')
    expect(link).toBe('hold://paypal-return?kind=fee&order=5O190127TN364715T')
    expect(paypalReturnSchema.parse(Object.fromEntries(new URL(link).searchParams))).toEqual({ kind: 'fee', order: '5O190127TN364715T' })
    expect(paypalReturnLink('hold', null)).toBe('hold://paypal-return?kind=hold')
  })
})
