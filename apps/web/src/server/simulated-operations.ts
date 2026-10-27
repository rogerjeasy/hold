import 'server-only'
import { inShop, rentalsForCaptures } from '@hold/db'
import type { Database } from '@hold/db'
import type { OpsDependencies } from '@hold/ops/run'
import type { FakePayPal } from '@hold/paypal'

// The operations run as the test environment does it, in this process: the simulated PayPal read by code, no model,
// so every entry carries its detector's fixed reason, and reminders kept rather than sent. The simulated PayPal serves
// every shop, so a shop is shown only the disputes on its own payments, as its own PayPal account would show it.
export function simulatedOperations(database: Database, paypal: FakePayPal): OpsDependencies {
  return {
    database,
    now: () => new Date(),
    investigator: undefined,
    paypal: (shopId) =>
      Promise.resolve({
        async disputes() {
          const read = await paypal.listOpenDisputes()
          if (!read.ok) return undefined
          const ours = await inShop(database, { role: 'hold_worker', shopId }, (transaction) => rentalsForCaptures(transaction, read.value.flatMap((dispute) => dispute.captureIds)))
          return read.value.filter((dispute) => dispute.captureIds.some((captureId) => ours[captureId] !== undefined))
        },
        async authorization(authorizationId: string) {
          const read = await paypal.readAuthorization(authorizationId)
          return read.ok ? read.value.status : undefined
        },
        openReader: () => Promise.resolve({ ok: false, reason: 'unreachable' } as const),
      }),
    remind: () => Promise.resolve(),
  }
}
