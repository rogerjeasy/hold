import type { Database, DatabaseRole } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'

// One message for a queue. Messages of one group are handled in order; one deduplication id is handled once.
export type QueueMessage = { readonly queue: string; readonly group: string; readonly deduplicationId: string; readonly body: Readonly<Record<string, unknown>> }

// Timed work (architecture.md section 7.4). Each schedule is named, fires once and sends its message to its queue.
export type Scheduler = {
  // Makes the schedule of this name, or moves it to the new time if it exists.
  at(name: string, when: Date, message: QueueMessage): Promise<void>
  // Removes the schedule of this name. A schedule that does not exist is already removed.
  remove(name: string): Promise<void>
}

// Something a person must hear about at once. The worker emails it; the test environment keeps it.
export type Notice =
  // To the owners: a hold ended with nothing replacing it.
  | { readonly kind: 'hold_expired'; readonly shopId: string; readonly rentalId: string }
  // To the renter: approve a new hold before the old one ends.
  | { readonly kind: 'hold_replacement'; readonly shopId: string; readonly rentalId: string; readonly approveUrl: string; readonly holdEndsAt: Date }
  // To the owners: the shop did not decide a contested claim by the date it promised the renter, and either the owner
  // now decides it or the owner's rule waived it (architecture.md section 6.16).
  | { readonly kind: 'promise_missed'; readonly shopId: string; readonly rentalId: string; readonly waived: boolean }

export type Notifier = {
  // Throws when it could not be told, so the queue tries again.
  tell(notice: Notice): Promise<void>
}

// What asking a renter for a new hold needs: a new link to the page where they approve it, and the words PayPal shows
// them, in their language. The worker signs the link with the renter-link key, which settling never sees.
export type RenterAsk = {
  approval(shopId: string, rentalId: string): Promise<{ readonly url: string; readonly orderDescription: string; readonly shopName: string }>
}

// What settling needs from outside: the database and the role it acts as, PayPal for a shop's account, a way to queue
// work, a way to schedule it, a way to tell people, a way to ask a renter for a new hold, and the clock. The worker gives SQS and EventBridge Scheduler; the test environment runs
// each message at once, in the same process, and keeps schedules in memory.
export type SettleDependencies = {
  readonly database: Database
  readonly role?: DatabaseRole
  readonly paypalFor: (credentialReference: string) => PayPalHolds
  readonly paypalMode: 'sandbox' | 'live'
  readonly send: (message: QueueMessage) => Promise<void>
  readonly scheduler: Scheduler
  readonly notifier: Notifier
  readonly renterAsk: RenterAsk
  readonly now: () => Date
}

// What recording an execution and handing it to the worker needs. The web app does only this; the worker runs it.
export type RequestDependencies = Pick<SettleDependencies, 'database' | 'role' | 'send' | 'now'>

// A PayPal failure that may pass, so the queue should try again. Anything else is PayPal's answer, kept as it is.
export class PayPalUnavailable extends Error {
  constructor(kind: string) {
    super(`PayPal is unavailable: ${kind}`)
    this.name = 'PayPalUnavailable'
  }
}

export const TRANSIENT: ReadonlySet<string> = new Set(['unavailable', 'unexpected_response'])
