import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import type { Money } from '@hold/domain'
import { createPayPalClient, createRestPayPalHolds } from '../src/index.ts'
import type { Authorization, PayPalFailure, PayPalHolds, PayPalResult } from '../src/index.ts'

// Shared by the sandbox trials in tech-stack.md section 16. A trial makes real calls to the PayPal sandbox,
// waits for a person to approve each order with a sandbox personal account, and prints what PayPal did.

const CLIENT_ID_VARIABLE = 'PAYPAL_SANDBOX_CLIENT_ID'
const CLIENT_SECRET_VARIABLE = 'PAYPAL_SANDBOX_CLIENT_SECRET'
const CURRENCY_VARIABLE = 'PAYPAL_TRIAL_CURRENCY'
const TOKEN_PATH = '/v1/oauth2/token'
const POLL_MILLISECONDS = 3000
const APPROVAL_LIMIT_MILLISECONDS = 15 * 60 * 1000
// PayPal sends the renter here after approving. The trial only watches the order, so any page will do.
const RETURN_URL = 'https://example.com/hold/approved'
const CANCEL_URL = 'https://example.com/hold/cancelled'

type Check = { readonly name: string; readonly passed: boolean; readonly observed: string }
type Exchange = { readonly method: string; readonly path: string; readonly status: number; readonly request: unknown; readonly reply: unknown }

export type HoldRequest = { readonly label: string; readonly amount: Money }

export type Trial = {
  readonly holds: PayPalHolds
  money(cents: number): Money
  key(): string
  check(name: string, passed: boolean, observed: string): void
  // Creates one order per request, waits until each is approved, and places the holds.
  placeApprovedHolds(requests: readonly HoldRequest[]): Promise<Authorization[]>
  finish(): Promise<void>
}

function requireVariable(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. Copy .env.example to .env at the repository root and fill it in.`)
  }
  return value
}

function parseBody(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function describeFailure(failure: PayPalFailure): string {
  const issue = failure.issue === undefined ? '' : ` (${failure.issue})`
  const debugId = failure.debugId === undefined ? '' : ` debug ID ${failure.debugId}`
  return `${failure.kind}${issue}${debugId}`
}

export function describe<Value>(result: PayPalResult<Value>, describeValue: (value: Value) => string): string {
  return result.ok ? describeValue(result.value) : `refused: ${describeFailure(result.error)}`
}

// A step the rest of the trial depends on. If it fails there is nothing more to learn, so the trial stops.
export function must<Value>(result: PayPalResult<Value>, step: string): Value {
  if (!result.ok) throw new Error(`${step} failed: ${describeFailure(result.error)}`)
  return result.value
}

export function startTrial(name: string): Trial {
  const clientId = requireVariable(CLIENT_ID_VARIABLE)
  const clientSecret = requireVariable(CLIENT_SECRET_VARIABLE)
  const currency = process.env[CURRENCY_VARIABLE] ?? 'USD'
  const checks: Check[] = []
  const exchanges: Exchange[] = []
  let polling = false

  // Keeps every call and reply so they can become the recorded responses the adapter tests use.
  // The token call is left out, so no credential or access token is ever written to disk.
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init)
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname !== TOKEN_PATH) {
      exchanges.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        status: response.status,
        request: typeof init?.body === 'string' ? parseBody(init.body) : undefined,
        reply: parseBody(await response.clone().text()),
      })
    }
    return response
  }

  const holds = createRestPayPalHolds(
    createPayPalClient({
      environment: 'sandbox',
      credentials: () => Promise.resolve({ clientId, clientSecret }),
      fetch: recordingFetch,
      onCall: (call) => {
        // Waiting for approval reads the order every few seconds. Those reads are not worth a line each.
        if (polling && call.method === 'GET' && call.status === 200) return
        console.log(`    ${call.method} ${call.path} -> ${String(call.status ?? 'no answer')} ${call.debugId ?? ''}`)
      },
    }),
  )

  async function waitForApproval(orderId: string, label: string): Promise<void> {
    const deadline = Date.now() + APPROVAL_LIMIT_MILLISECONDS
    polling = true
    try {
      while (Date.now() < deadline) {
        const order = must(await holds.readHoldOrder(orderId), `Reading order ${orderId}`)
        if (order.status === 'approved') return
        if (order.status !== 'awaiting_approval') throw new Error(`Order ${orderId} (${label}) became ${order.status}.`)
        await wait(POLL_MILLISECONDS)
      }
      throw new Error(`Order ${orderId} (${label}) was not approved in time.`)
    } finally {
      polling = false
    }
  }

  console.log(`\nTrial: ${name}, in ${currency}, against the PayPal sandbox\n`)

  return {
    holds,
    money: (cents) => ({ cents, currency }),
    key: () => randomUUID(),

    check(checkName, passed, observed) {
      checks.push({ name: checkName, passed, observed })
      console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${checkName}\n        ${observed}`)
    },

    async placeApprovedHolds(requests) {
      const orders = []
      for (const request of requests) {
        const order = must(
          await holds.createHoldOrder({
            amount: request.amount,
            rentalReference: `trial-${name}-${randomUUID()}`,
            description: `Hold trial. ${request.label}`,
            returnUrl: RETURN_URL,
            cancelUrl: CANCEL_URL,
            idempotencyKey: randomUUID(),
          }),
          `Creating the order for "${request.label}"`,
        )
        orders.push({ ...order, label: request.label })
      }
      console.log('\nApprove each order with a sandbox personal account. The trial continues by itself.\n')
      for (const order of orders) console.log(`  ${order.label}\n  ${order.approvalUrl ?? 'no approval link'}\n`)

      const placed = []
      for (const order of orders) {
        console.log(`Waiting for "${order.label}" to be approved...`)
        await waitForApproval(order.orderId, order.label)
        console.log(`\n${order.label}: approved`)
        placed.push(
          must(await holds.placeHold({ orderId: order.orderId, idempotencyKey: randomUUID() }), `Placing "${order.label}"`),
        )
      }
      return placed
    },

    async finish() {
      const folder = join(import.meta.dirname, 'recordings')
      await mkdir(folder, { recursive: true })
      const file = join(folder, `${name}-${new Date().toISOString().replaceAll(':', '-')}.json`)
      await writeFile(file, JSON.stringify({ trial: name, currency, checks, exchanges }, null, 2))

      const failed = checks.filter((check) => !check.passed)
      console.log(`\n${String(checks.length - failed.length)} of ${String(checks.length)} checks passed. Recorded in ${file}`)
      for (const check of failed) console.log(`  FAIL  ${check.name}: ${check.observed}`)
      if (failed.length > 0) process.exitCode = 1
    },
  }
}
