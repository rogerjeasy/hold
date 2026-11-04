import type { PayPalHolds, PayPalResult } from '@hold/paypal'

// Asks PayPal whether it signed this exact delivery for this subscription (architecture.md section 8.5). The intake asks
// before it stores anything, so a forged post never reaches the table; the worker asks again before it applies a row.

const header = (headers: Readonly<Record<string, string>>, name: string) => headers[name] ?? ''

export function verifyPayPalDelivery(paypal: PayPalHolds, webhookId: string, rawBody: string, headers: Readonly<Record<string, string>>): Promise<PayPalResult<'verified' | 'rejected'>> {
  return paypal.verifyWebhook({
    webhookId,
    body: rawBody,
    headers: {
      transmissionId: header(headers, 'paypal-transmission-id'),
      transmissionTime: header(headers, 'paypal-transmission-time'),
      transmissionSig: header(headers, 'paypal-transmission-sig'),
      certUrl: header(headers, 'paypal-cert-url'),
      authAlgo: header(headers, 'paypal-auth-algo'),
    },
  })
}
