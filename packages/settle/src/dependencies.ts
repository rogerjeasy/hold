import type { Database, DatabaseRole } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'

// One message for a queue. Messages of one group are handled in order; one deduplication id is handled once.
export type QueueMessage = { readonly queue: string; readonly group: string; readonly deduplicationId: string; readonly body: Readonly<Record<string, unknown>> }

// What settling needs from outside: the database and the role it acts as, PayPal for a shop's account, a way to queue
// work and the clock. The worker gives SQS; the test environment runs each message at once, in the same process.
export type SettleDependencies = {
  readonly database: Database
  readonly role?: DatabaseRole
  readonly paypalFor: (credentialReference: string) => PayPalHolds
  readonly paypalMode: 'sandbox' | 'live'
  readonly send: (message: QueueMessage) => Promise<void>
  readonly now: () => Date
}

// A PayPal failure that may pass, so the queue should try again. Anything else is PayPal's answer, kept as it is.
export class PayPalUnavailable extends Error {
  constructor(kind: string) {
    super(`PayPal is unavailable: ${kind}`)
    this.name = 'PayPalUnavailable'
  }
}

export const TRANSIENT: ReadonlySet<string> = new Set(['unavailable', 'unexpected_response'])
