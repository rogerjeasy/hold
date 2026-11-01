import { z } from 'zod'
import { MOBILE_API_BASE } from './staff'

// PayPal from the phone (architecture.md section 13.8). The approval stays PayPal's own page, opened in an in-app
// browser session. Starting a payment with returnTo 'app' makes the order return to Hold's https page for its kind,
// which hands the renter back to the app at the address below; the session closes on it. The app then sends the
// payment's confirm action with the order it was given, and the server reads the order back from PayPal, so the
// address proves nothing and changes nothing: it only brings the renter back.

export const PAYPAL_RETURN_KINDS = ['fee', 'hold', 'extension'] as const
export type PayPalReturnKind = (typeof PAYPAL_RETURN_KINDS)[number]

// Where PayPal sends the renter after its page: back to the web page they came from, or to the app.
export const RETURN_TO = ['page', 'app'] as const
export type ReturnTo = (typeof RETURN_TO)[number]

// The app's own scheme (apps/mobile/app.config.ts) and the path the in-app browser session waits for.
export const APP_SCHEME = 'hold'
export const PAYPAL_RETURN_LINK = `${APP_SCHEME}://paypal-return`

// Hold's https page PayPal returns to, under the phone's API. It reads and writes nothing.
export const paypalReturnPath = (kind: PayPalReturnKind) => `${MOBILE_API_BASE}/paypal-return/${kind}`

// PayPal names its order `token` when it sends the renter back. Its identifiers are letters, digits and dashes.
export const paypalOrderId = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/)

export const paypalReturnLink = (kind: PayPalReturnKind, orderId: string | null) => {
  const query = new URLSearchParams({ kind })
  if (orderId !== null) query.set('order', orderId)
  return `${PAYPAL_RETURN_LINK}?${query.toString()}`
}

// What the app reads from the address it was handed back at.
export const paypalReturnSchema = z.object({ kind: z.enum(PAYPAL_RETURN_KINDS), order: paypalOrderId.optional() })
