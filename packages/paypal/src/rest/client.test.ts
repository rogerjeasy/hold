import { describe, expect, it } from 'vitest'
import { createPayPalClient } from './client.ts'
import type { PayPalCallRecord, PayPalClient } from './client.ts'
import { NO_ANSWER, stubServer, TOKEN_PATH, TOKEN_REPLY } from './stub-server.ts'
import type { StubReply, StubServer } from './stub-server.ts'

const CLIENT_SECRET = 'stub-client-secret'
const CAPTURE_PATH = '/v2/payments/authorizations/AUTH-1/capture'
const CAPTURE = { method: 'POST', path: CAPTURE_PATH, body: { final_capture: true }, idempotencyKey: 'execution-1' } as const
const READ = { method: 'GET', path: '/v2/payments/authorizations/AUTH-1' } as const
const OK: StubReply = { status: 200, body: { id: 'AUTH-1' }, debugId: 'debug-ok' }
const BUSY: StubReply = { status: 503, body: { name: 'SERVICE_UNAVAILABLE' }, debugId: 'debug-busy' }

type Harness = {
  readonly client: PayPalClient
  readonly server: StubServer
  readonly sleeps: number[]
  readonly records: PayPalCallRecord[]
  readonly setNow: (now: Date) => void
}

function harness(replies: readonly (StubReply | typeof NO_ANSWER)[]): Harness {
  const server = stubServer(replies)
  const sleeps: number[] = []
  const records: PayPalCallRecord[] = []
  let now = new Date('2026-10-17T09:00:00Z')
  const client = createPayPalClient({
    environment: 'sandbox',
    credentials: () => Promise.resolve({ clientId: 'stub-client-id', clientSecret: CLIENT_SECRET }),
    fetch: server.fetch,
    now: () => now,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds)
      return Promise.resolve()
    },
    onCall: (record) => records.push(record),
  })
  return {
    client,
    server,
    sleeps,
    records,
    setNow: (next) => {
      now = next
    },
  }
}

describe('access tokens', () => {
  it('fetches one token with the shop credentials and uses it for later calls', async () => {
    const { client, server } = harness([TOKEN_REPLY, OK, OK])

    await client.send(READ)
    await client.send(READ)

    expect(server.calls.map((call) => call.path)).toEqual([TOKEN_PATH, READ.path, READ.path])
    expect(server.calls[0]?.headers.get('authorization')).toBe(`Basic ${btoa(`stub-client-id:${CLIENT_SECRET}`)}`)
    expect(server.calls[1]?.headers.get('authorization')).toBe('Bearer stub-access-token')
  })

  it('fetches a new token shortly before the old one lapses', async () => {
    const { client, server, setNow } = harness([TOKEN_REPLY, OK, TOKEN_REPLY, OK])

    await client.send(READ)
    setNow(new Date('2026-10-17T17:59:30Z'))
    await client.send(READ)

    expect(server.calls.filter((call) => call.path === TOKEN_PATH)).toHaveLength(2)
  })

  it('fetches a new token and tries again when PayPal withdraws one early', async () => {
    const { client, server } = harness([TOKEN_REPLY, { status: 401, body: { name: 'AUTHENTICATION_FAILURE' } }, TOKEN_REPLY, OK])

    const result = await client.send(READ)

    expect(result.ok).toBe(true)
    expect(server.calls.map((call) => call.path)).toEqual([TOKEN_PATH, READ.path, TOKEN_PATH, READ.path])
  })

  it('reports refused credentials without trying again', async () => {
    const { client, server } = harness([{ status: 401, body: { error: 'invalid_client' } }])

    const result = await client.send(READ)

    expect(result).toMatchObject({ ok: false, error: { kind: 'rejected' } })
    expect(server.calls).toHaveLength(1)
  })

  it('keeps the secret and the token out of the call records', async () => {
    const { client, records } = harness([TOKEN_REPLY, OK])

    await client.send(CAPTURE)

    const written = JSON.stringify(records)
    expect(records).toHaveLength(2)
    expect(written).not.toContain(CLIENT_SECRET)
    expect(written).not.toContain('stub-access-token')
  })
})

describe('checking credentials', () => {
  it('asks for a token and nothing else', async () => {
    const { client, server } = harness([TOKEN_REPLY])

    expect(await client.checkCredentials()).toEqual({ ok: true, value: undefined })
    expect(server.calls.map((call) => call.path)).toEqual([TOKEN_PATH])
  })

  it('reports credentials PayPal refuses', async () => {
    const { client } = harness([{ status: 401, body: { error: 'invalid_client' } }])

    expect(await client.checkCredentials()).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })
})

describe('sending a call', () => {
  it('sends a write with its idempotency key as PayPal-Request-Id', async () => {
    const { client, server } = harness([TOKEN_REPLY, OK])

    await client.send(CAPTURE)

    const [call] = server.apiCalls()
    expect(call?.headers.get('paypal-request-id')).toBe('execution-1')
    expect(call?.headers.get('content-type')).toBe('application/json')
    expect(call?.body).toEqual({ final_capture: true })
  })

  it('sends a form as multipart, with its idempotency key, leaving the boundary to fetch', async () => {
    const { client, server } = harness([TOKEN_REPLY, OK])
    const form = new FormData()
    form.append('input', '{"evidences":[]}')

    await client.send({ method: 'POST', path: '/v1/customer/disputes/PP-D-1/provide-evidence', form, idempotencyKey: 'proposal-1' })

    const [call] = server.apiCalls()
    expect(call?.headers.get('paypal-request-id')).toBe('proposal-1')
    expect(call?.headers.get('content-type')).toBeNull()
    expect(call?.body).toBe(form)
  })

  it('returns the reply with PayPal debug ID', async () => {
    const { client } = harness([TOKEN_REPLY, OK])

    expect(await client.send(READ)).toEqual({ ok: true, value: { status: 200, body: { id: 'AUTH-1' }, debugId: 'debug-ok' } })
  })

  it('reads an empty reply as no body', async () => {
    const { client } = harness([TOKEN_REPLY, { status: 204 }])

    expect(await client.send(CAPTURE)).toMatchObject({ ok: true, value: { status: 204, body: undefined } })
  })
})

describe('retries', () => {
  it('tries a failing write again with the same idempotency key, waiting longer each time', async () => {
    const { client, server, sleeps } = harness([TOKEN_REPLY, BUSY, NO_ANSWER, OK])

    const result = await client.send(CAPTURE)

    expect(result.ok).toBe(true)
    expect(server.apiCalls().map((call) => call.headers.get('paypal-request-id'))).toEqual(['execution-1', 'execution-1', 'execution-1'])
    expect(sleeps).toEqual([250, 500])
  })

  it('reports PayPal as unavailable after three attempts', async () => {
    const { client, server } = harness([TOKEN_REPLY, BUSY, BUSY, BUSY])

    const result = await client.send(CAPTURE)

    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable', debugId: 'debug-busy' } })
    expect(server.apiCalls()).toHaveLength(3)
  })

  it('reports PayPal as unavailable when it never answers', async () => {
    const { client, records } = harness([TOKEN_REPLY, NO_ANSWER, NO_ANSWER, NO_ANSWER])

    expect(await client.send(READ)).toMatchObject({ ok: false, error: { kind: 'unavailable' } })
    expect(records.at(-1)).toMatchObject({ status: undefined, attempt: 3 })
  })

  it('tries again when PayPal says there were too many requests', async () => {
    const { client } = harness([TOKEN_REPLY, { status: 429 }, OK])

    expect((await client.send(READ)).ok).toBe(true)
  })

  it('does not try a refused call again', async () => {
    const refused: StubReply = {
      status: 422,
      debugId: 'debug-refused',
      body: {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The requested action could not be performed.',
        details: [{ issue: 'AUTHORIZATION_VOIDED', description: 'A voided authorization cannot be captured.' }],
      },
    }
    const { client, server, sleeps } = harness([TOKEN_REPLY, refused])

    const result = await client.send(CAPTURE)

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'hold_voided',
        issue: 'AUTHORIZATION_VOIDED',
        description: 'A voided authorization cannot be captured.',
        debugId: 'debug-refused',
      },
    })
    expect(server.apiCalls()).toHaveLength(1)
    expect(sleeps).toEqual([])
  })
})

describe('refusals', () => {
  it.each([
    ['ORDER_NOT_APPROVED', 'order_not_approved'],
    ['INSTRUMENT_DECLINED', 'declined'],
    ['AUTHORIZATION_EXPIRED', 'hold_expired'],
    ['AUTHORIZATION_ALREADY_CAPTURED', 'hold_already_captured'],
    ['MAX_CAPTURE_AMOUNT_EXCEEDED', 'amount_exceeds_hold'],
    ['REAUTHORIZATION_TOO_SOON', 'renewal_too_soon'],
  ])('names %s as %s', async (issue, kind) => {
    const { client } = harness([TOKEN_REPLY, { status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] } }])

    expect(await client.send(CAPTURE)).toMatchObject({ ok: false, error: { kind, issue } })
  })

  it('keeps PayPal name for a refusal Hold has no name for', async () => {
    const { client } = harness([TOKEN_REPLY, { status: 422, body: { details: [{ issue: 'SOMETHING_NEW' }] } }])

    expect(await client.send(CAPTURE)).toMatchObject({ ok: false, error: { kind: 'rejected', issue: 'SOMETHING_NEW' } })
  })

  it('reports a missing resource as not found', async () => {
    const { client } = harness([TOKEN_REPLY, { status: 404, body: { name: 'RESOURCE_NOT_FOUND' } }])

    expect(await client.send(READ)).toMatchObject({ ok: false, error: { kind: 'not_found' } })
  })
})
