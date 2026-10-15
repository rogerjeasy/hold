'use server'

import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { confirmFeePayment, startFeePayment } from '@/server/fee-payment'
import { renterAction, withToken } from '@/server/renter-access'

// What a renter does through their link. Each is built by renterAction, which checks the link, its scope and the
// network's rate before the work below runs, and writes the audit line after it. A test checks that this file exports
// nothing else. No amount comes from the renter: the fee is the one stored on the rental.

export const payFee = renterAction({ name: 'renter.fee_started', scope: 'pay', input: withToken({}) }, (link, input, inLinkShop) =>
  startFeePayment(link, inLinkShop, input.token, readLocale(input.locale)),
)

export const confirmFee = renterAction({ name: 'renter.fee_confirmed', scope: 'pay', input: withToken({ orderId: z.string().min(1).max(64) }) }, (link, input, inLinkShop) =>
  confirmFeePayment(link, inLinkShop, input.orderId),
)
