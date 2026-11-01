import { readFile } from 'node:fs/promises'
import { ResourceNotFoundException } from '@aws-sdk/client-secrets-manager'
import { describe, expect, it, vi } from 'vitest'
import { createExpoPushSender, expoAccessTokenFromSecret } from './expo-push.ts'
import type { PushMessage } from './push.ts'

// The answers below are Expo's push service's documented answers (docs.expo.dev, "Send notifications with Expo's push
// service"), kept as files: a sent batch with a ticket, a device that is gone and a refusal; a whole request refused;
// and the receipts read later.
const recorded = async (name: string): Promise<unknown> => JSON.parse(await readFile(new URL(`./recorded/${name}.json`, import.meta.url), 'utf8'))

const message = (to: string): PushMessage => ({ to, title: 'Ribeira Bikes', body: 'Your claim is ready to read.', data: { kind: 'renter', reference: 'r-1', page: 'claim' } })

type Call = { readonly url: string; readonly init: RequestInit }
function fakeFetch(answers: readonly unknown[], status = 200) {
  const calls: Call[] = []
  let next = 0
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} })
    const body = answers[Math.min(next, answers.length - 1)]
    next += 1
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  })
  return { fetch, calls }
}
const sentBody = (call: Call | undefined): unknown => JSON.parse(typeof call?.init.body === 'string' ? call.init.body : '')
const headersOf = (call: Call | undefined) => new Headers(call?.init.headers)

describe('pushes through Expo’s push service', () => {
  it('sends each message with Hold’s Android channel and reads a ticket, a device that is gone and a refusal in order', async () => {
    const { fetch, calls } = fakeFetch([await recorded('expo-push-send')])
    const sender = createExpoPushSender({ fetch, accessToken: () => Promise.resolve(undefined) })
    const tickets = await sender.send([message('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'), message('ExponentPushToken[gonegonegonegonegone00]'), message('ExponentPushToken[cccccccccccccccccccccc]')])
    expect(tickets).toEqual([{ ok: true, ticket: '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e01' }, { ok: false, reason: 'device_not_registered' }, { ok: false, reason: 'unavailable' }])
    expect(calls[0]?.url).toBe('https://exp.host/--/api/v2/push/send')
    expect(calls[0]?.init.method).toBe('POST')
    expect(sentBody(calls[0])).toEqual([0, 1, 2].map((index) => ({ ...message(['ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ExponentPushToken[gonegonegonegonegone00]', 'ExponentPushToken[cccccccccccccccccccccc]'][index] ?? ''), sound: 'default', channelId: 'default', priority: 'high' })))
  })

  it('sends no authorization without an access token, and Expo’s bearer with one', async () => {
    const without = fakeFetch([{ data: [{ status: 'ok', id: 't-1' }] }])
    await createExpoPushSender({ fetch: without.fetch, accessToken: () => Promise.resolve(undefined) }).send([message('ExponentPushToken[a]')])
    expect(headersOf(without.calls[0]).has('authorization')).toBe(false)
    const withToken = fakeFetch([{ data: [{ status: 'ok', id: 't-1' }] }])
    await createExpoPushSender({ fetch: withToken.fetch, accessToken: () => Promise.resolve('expo-access-token') }).send([message('ExponentPushToken[a]')])
    expect(headersOf(withToken.calls[0]).get('authorization')).toBe('Bearer expo-access-token')
  })

  it('sends at most a hundred messages a request, as Expo allows', async () => {
    const { fetch, calls } = fakeFetch([{ data: Array.from({ length: 100 }, (_, index) => ({ status: 'ok', id: `t-${String(index)}` })) }, { data: Array.from({ length: 50 }, (_, index) => ({ status: 'ok', id: `u-${String(index)}` })) }])
    const tickets = await createExpoPushSender({ fetch, accessToken: () => Promise.resolve(undefined) }).send(Array.from({ length: 150 }, (_, index) => message(`ExponentPushToken[t${String(index)}]`)))
    expect(calls.map((call) => (sentBody(call) as unknown[]).length)).toEqual([100, 50])
    expect(tickets).toHaveLength(150)
    expect(tickets.every((ticket) => ticket.ok)).toBe(true)
  })

  it('counts a request Expo refused, an answer of the wrong shape or no network as unavailable, and logs no token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const refused = fakeFetch([await recorded('expo-push-request-error')], 400)
    expect(await createExpoPushSender({ fetch: refused.fetch, accessToken: () => Promise.resolve(undefined) }).send([message('ExponentPushToken[secretsecret]')])).toEqual([{ ok: false, reason: 'unavailable' }])
    const short = fakeFetch([{ data: [] }])
    expect(await createExpoPushSender({ fetch: short.fetch, accessToken: () => Promise.resolve(undefined) }).send([message('ExponentPushToken[secretsecret]')])).toEqual([{ ok: false, reason: 'unavailable' }])
    const offline = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    expect(await createExpoPushSender({ fetch: offline, accessToken: () => Promise.resolve(undefined) }).send([message('ExponentPushToken[secretsecret]')])).toEqual([{ ok: false, reason: 'unavailable' }])
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secretsecret')
    warn.mockRestore()
  })

  it('reads receipts: delivered, a device that is gone, and anything else as not known', async () => {
    const { fetch, calls } = fakeFetch([await recorded('expo-push-receipts')])
    const receipts = await createExpoPushSender({ fetch, accessToken: () => Promise.resolve(undefined) }).receipts(['019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e01', '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e02', '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e03', 'not-ready-yet'])
    expect(calls[0]?.url).toBe('https://exp.host/--/api/v2/push/getReceipts')
    expect(sentBody(calls[0])).toEqual({ ids: ['019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e01', '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e02', '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e03', 'not-ready-yet'] })
    expect(Object.fromEntries(receipts)).toEqual({
      '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e01': 'delivered',
      '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e02': 'device_not_registered',
      '019a3f0c-7b1e-7d55-9a2e-4c1f6b8d2e03': 'unknown',
      'not-ready-yet': 'unknown',
    })
  })

  it('asks for no receipts when there are none to read', async () => {
    const { fetch } = fakeFetch([{}])
    expect((await createExpoPushSender({ fetch, accessToken: () => Promise.resolve(undefined) }).receipts([])).size).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('the Expo access token kept in Secrets Manager', () => {
  const holding = (send: () => Promise<{ SecretString?: string }>) => ({ send: vi.fn(send) })

  it('is read once, from the secret named', async () => {
    const client = holding(() => Promise.resolve({ SecretString: 'expo-access-token' }))
    const token = expoAccessTokenFromSecret('hold/notify/expo-push-access-token', 'us-east-1', client)
    expect(await token()).toBe('expo-access-token')
    expect(await token()).toBe('expo-access-token')
    expect(client.send).toHaveBeenCalledTimes(1)
  })

  it('is absent when no secret is named, or the secret does not exist, so pushes go without one', async () => {
    expect(await expoAccessTokenFromSecret(undefined, 'us-east-1')()).toBeUndefined()
    const missing = holding(() => Promise.reject(new ResourceNotFoundException({ message: 'not found', $metadata: {} })))
    expect(await expoAccessTokenFromSecret('hold/notify/expo-push-access-token', 'us-east-1', missing)()).toBeUndefined()
  })

  it('is tried again after Secrets Manager could not be reached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let calls = 0
    const flaky = holding(() => (calls++ === 0 ? Promise.reject(new Error('timeout')) : Promise.resolve({ SecretString: 'expo-access-token' })))
    const token = expoAccessTokenFromSecret('hold/notify/expo-push-access-token', 'us-east-1', flaky)
    expect(await token()).toBeUndefined()
    expect(await token()).toBe('expo-access-token')
    warn.mockRestore()
  })
})
