import { fail, ok } from '@hold/domain'
import type { PayPalFailure, PayPalFailureKind, PayPalResult } from '../port.ts'
import { errorSchema, tokenSchema } from './schemas.ts'

export type PayPalEnvironment = 'sandbox' | 'live'

export type PayPalCredentials = {
  readonly clientId: string
  readonly clientSecret: string
}

// One line per call to PayPal, safe to log. It carries no token and no body.
export type PayPalCallRecord = {
  readonly method: string
  readonly path: string
  // Absent when PayPal could not be reached at all.
  readonly status: number | undefined
  readonly debugId: string | undefined
  readonly attempt: number
}

export type PayPalClientOptions = {
  readonly environment: PayPalEnvironment
  // Asked each time a token is needed, so the secret lives only as long as the call that uses it.
  readonly credentials: () => Promise<PayPalCredentials>
  readonly fetch?: typeof fetch
  readonly now?: () => Date
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly onCall?: (record: PayPalCallRecord) => void
}

// A write always carries an idempotency key, which is what makes it safe to retry.
export type PayPalRequest =
  | { readonly method: 'GET'; readonly path: string }
  | { readonly method: 'POST'; readonly path: string; readonly body?: unknown; readonly idempotencyKey: string }

export type PayPalReply = {
  readonly status: number
  readonly body: unknown
  readonly debugId: string | undefined
}

export type PayPalClient = {
  send(request: PayPalRequest): Promise<PayPalResult<PayPalReply>>
  // Asks PayPal for a token and nothing else: proof that the credentials work, before Hold stores them.
  checkCredentials(): Promise<PayPalResult<void>>
  // The shop's access token, for PayPal's own MCP server only. It never reaches a model or a log.
  accessToken(): Promise<PayPalResult<string>>
}

type Attempt<Value> =
  | { readonly retry: false; readonly result: PayPalResult<Value> }
  | { readonly retry: true; readonly failure: PayPalFailure }

const BASE_URLS: Record<PayPalEnvironment, string> = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
}
const TOKEN_PATH = '/v1/oauth2/token'
const MAX_ATTEMPTS = 3
const FIRST_BACKOFF_MILLISECONDS = 250
const TIMEOUT_MILLISECONDS = 15_000
// A token is replaced this long before PayPal would refuse it, so a call never starts with one about to lapse.
const TOKEN_MARGIN_MILLISECONDS = 60_000
const UNAUTHORIZED = 401
const NOT_FOUND = 404
const TOO_MANY_REQUESTS = 429

// PayPal's names for the refusals Hold acts on differently. Anything else stays `rejected` and keeps PayPal's name.
const KIND_BY_ISSUE: ReadonlyMap<string, PayPalFailureKind> = new Map([
  ['ORDER_NOT_APPROVED', 'order_not_approved'],
  ['INSTRUMENT_DECLINED', 'declined'],
  ['TRANSACTION_REFUSED', 'declined'],
  ['PAYER_CANNOT_PAY', 'declined'],
  ['AUTHORIZATION_DENIED', 'declined'],
  ['AUTHORIZATION_EXPIRED', 'hold_expired'],
  ['AUTHORIZATION_VOIDED', 'hold_voided'],
  ['PREVIOUSLY_VOIDED', 'hold_voided'],
  ['AUTHORIZATION_ALREADY_CAPTURED', 'hold_already_captured'],
  ['PREVIOUSLY_CAPTURED', 'hold_already_captured'],
  ['MAX_CAPTURE_AMOUNT_EXCEEDED', 'amount_exceeds_hold'],
  ['REAUTHORIZATION_TOO_SOON', 'renewal_too_soon'],
  ['INVALID_RESOURCE_ID', 'not_found'],
  // Asking again for a capture already made: Hold reads the order instead.
  ['ORDER_ALREADY_CAPTURED', 'already_captured'],
  ['WEBHOOK_URL_ALREADY_EXISTS', 'webhook_exists'],
])

function parseJson(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    // A reply that is not JSON is unreadable. The schema that reads it next reports that.
    return undefined
  }
}

function failureFrom(reply: PayPalReply): PayPalFailure {
  const parsed = errorSchema.safeParse(reply.body)
  const error = parsed.success ? parsed.data : {}
  const detail = error.details?.[0]
  const issue = detail?.issue ?? error.name
  const named = issue === undefined ? undefined : KIND_BY_ISSUE.get(issue)
  return {
    kind: named ?? (reply.status === NOT_FOUND ? 'not_found' : 'rejected'),
    issue,
    description: detail?.description ?? error.message,
    debugId: reply.debugId ?? error.debug_id,
  }
}

function unavailable(reply: PayPalReply | undefined): PayPalFailure {
  return reply === undefined
    ? { kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined }
    : { ...failureFrom(reply), kind: 'unavailable' }
}

function isTemporary(status: number): boolean {
  return status === TOO_MANY_REQUESTS || status >= 500
}

export function createPayPalClient(options: PayPalClientOptions): PayPalClient {
  const fetchFrom = options.fetch ?? fetch
  const now = options.now ?? (() => new Date())
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds)
      }))
  const baseUrl = BASE_URLS[options.environment]
  let cachedToken: { readonly value: string; readonly freshUntil: number } | undefined

  async function exchange(
    attempt: number,
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<PayPalReply | undefined> {
    let reply: PayPalReply | undefined
    try {
      const response = await fetchFrom(baseUrl + path, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      })
      reply = {
        status: response.status,
        body: parseJson(await response.text()),
        debugId: response.headers.get('paypal-debug-id') ?? undefined,
      }
    } catch {
      // No answer: a dropped connection or a timeout. The caller retries, then reports PayPal as unavailable.
      reply = undefined
    }
    options.onCall?.({ method, path, status: reply?.status, debugId: reply?.debugId, attempt })
    return reply
  }

  // Runs a call until it gives a final answer. A retried write repeats the same idempotency key, so PayPal acts once.
  async function withRetries<Value>(call: (attempt: number) => Promise<Attempt<Value>>): Promise<PayPalResult<Value>> {
    let failure = unavailable(undefined)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await sleep(FIRST_BACKOFF_MILLISECONDS * 2 ** (attempt - 2))
      const outcome = await call(attempt)
      if (!outcome.retry) return outcome.result
      failure = outcome.failure
    }
    return fail(failure)
  }

  async function requestToken(attempt: number): Promise<Attempt<string>> {
    const { clientId, clientSecret } = await options.credentials()
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const reply = await exchange(
      attempt,
      'POST',
      TOKEN_PATH,
      { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      'grant_type=client_credentials',
    )
    if (reply === undefined || isTemporary(reply.status)) return { retry: true, failure: unavailable(reply) }
    if (reply.status >= 400) return { retry: false, result: fail(failureFrom(reply)) }
    const token = tokenSchema.safeParse(reply.body)
    if (!token.success) {
      // The reason is left out on purpose: this is the one reply whose contents must never reach a log.
      return {
        retry: false,
        result: fail({ kind: 'unexpected_response', issue: undefined, description: undefined, debugId: reply.debugId }),
      }
    }
    const lifetime = token.data.expires_in * 1000 - TOKEN_MARGIN_MILLISECONDS
    cachedToken = { value: token.data.access_token, freshUntil: now().getTime() + lifetime }
    return { retry: false, result: ok(token.data.access_token) }
  }

  async function accessToken(): Promise<PayPalResult<string>> {
    if (cachedToken !== undefined && now().getTime() < cachedToken.freshUntil) return ok(cachedToken.value)
    return withRetries(requestToken)
  }

  function headersFor(token: string, request: PayPalRequest): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      // Asks PayPal for the whole resource in its reply, not just a reference to it.
      Prefer: 'return=representation',
    }
    if (request.method === 'POST') {
      headers['Content-Type'] = 'application/json'
      headers['PayPal-Request-Id'] = request.idempotencyKey
    }
    return headers
  }

  async function attemptSend(request: PayPalRequest, body: string | undefined, attempt: number): Promise<Attempt<PayPalReply>> {
    const token = await accessToken()
    if (!token.ok) return { retry: false, result: token }
    const reply = await exchange(attempt, request.method, request.path, headersFor(token.value, request), body)
    if (reply === undefined || isTemporary(reply.status)) return { retry: true, failure: unavailable(reply) }
    if (reply.status === UNAUTHORIZED) {
      // PayPal withdrew the token early. Drop it, and the next attempt fetches a new one.
      cachedToken = undefined
      return { retry: true, failure: failureFrom(reply) }
    }
    return { retry: false, result: reply.status >= 400 ? fail(failureFrom(reply)) : ok(reply) }
  }

  return {
    send(request) {
      const body = request.method === 'POST' && request.body !== undefined ? JSON.stringify(request.body) : undefined
      return withRetries((attempt) => attemptSend(request, body, attempt))
    },
    async checkCredentials() {
      cachedToken = undefined
      const token = await accessToken()
      return token.ok ? ok(undefined) : token
    },
    accessToken,
  }
}
