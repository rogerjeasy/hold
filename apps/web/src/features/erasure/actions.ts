'use server'

import { eraseRenter as eraseRenterDetails } from '@hold/db'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

// Erasing a renter's personal details on their request (architecture.md section 15.2). Built by shopAction, which
// checks who is asking and their role before the work runs, and writes the audit line with it. Only an owner, proven by
// a passkey, since it cannot be undone. A test checks that this file exports nothing else.
export const eraseRenter = shopAction(
  {
    name: 'renter.erased',
    roles: ['owner'],
    needsPasskey: true,
    input: withLocale({ rentalId: z.uuid() }),
    auditDetail: (output: { readonly rentalId: string; readonly rentals: number }) => ({ rentalId: output.rentalId, rentals: output.rentals }),
  },
  async (_context, input, transaction) => {
    const erased = await eraseRenterDetails(transaction, input.rentalId, new Date())
    return erased.ok ? { rentalId: input.rentalId, rentals: erased.rentals } : new Refusal(erased.reason)
  },
)
