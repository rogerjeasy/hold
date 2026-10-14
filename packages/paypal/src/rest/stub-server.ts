// Test support. Stands in for PayPal's HTTP API: answers each call with the next scripted reply and keeps what
// was sent. The replies in the tests are written from PayPal's API reference until the sandbox trials record real ones.

export type StubReply = {
  readonly status: number
  readonly body?: unknown
  readonly debugId?: string
}

export type SentCall = {
  readonly method: string
  readonly path: string
  readonly headers: Headers
  readonly body: unknown
}

export type StubServer = {
  readonly fetch: typeof fetch
  readonly calls: SentCall[]
  // Calls other than the token exchange.
  apiCalls(): SentCall[]
}

export const TOKEN_PATH = '/v1/oauth2/token'
export const TOKEN_REPLY: StubReply = { status: 200, body: { access_token: 'stub-access-token', expires_in: 32400 } }
export const NO_ANSWER = 'no answer'

function readBody(body: unknown): unknown {
  if (typeof body !== 'string') return undefined
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

export function stubServer(replies: readonly (StubReply | typeof NO_ANSWER)[]): StubServer {
  const calls: SentCall[] = []
  const waiting = [...replies]

  const stubFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, headers: new Headers(init?.headers), body: readBody(init?.body) })
    const reply = waiting.shift()
    if (reply === undefined) return Promise.reject(new Error(`No reply was scripted for ${url.pathname}.`))
    if (reply === NO_ANSWER) return Promise.reject(new TypeError('fetch failed'))
    const headers = reply.debugId === undefined ? undefined : { 'paypal-debug-id': reply.debugId }
    const text = reply.body === undefined ? null : JSON.stringify(reply.body)
    return Promise.resolve(new Response(text, { status: reply.status, ...(headers === undefined ? {} : { headers }) }))
  }

  return { fetch: stubFetch, calls, apiCalls: () => calls.filter((call) => call.path !== TOKEN_PATH) }
}
