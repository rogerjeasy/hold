import 'server-only'
import type { Database } from '@hold/db'
import type { OpsDependencies } from '@hold/ops/run'
import type { FakePayPal } from '@hold/paypal'

// The operations run as the test environment does it, in this process: the simulated PayPal read by code, no model,
// so every entry carries its detector's fixed reason, and reminders kept rather than sent.
export function simulatedOperations(database: Database, paypal: FakePayPal): OpsDependencies {
  return {
    database,
    now: () => new Date(),
    investigator: undefined,
    paypal: () =>
      Promise.resolve({
        async disputes() {
          const read = await paypal.listOpenDisputes()
          return read.ok ? read.value : undefined
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
