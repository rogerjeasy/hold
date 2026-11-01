import 'server-only'
import { paypalReturnPath } from '@hold/mobile-api'
import type { PayPalReturnKind, ReturnTo } from '@hold/mobile-api'
import { getServices } from './services'

// Where PayPal sends the renter back to, and from where on its own page they cancel. A renter on the web returns to
// the page they came from; one in the phone app returns to Hold's page that hands them back to the app
// (architecture.md section 13.8). Either way the confirm that follows reads the order back from PayPal.
export async function paypalReturn(returnTo: ReturnTo, kind: PayPalReturnKind, page: { readonly returnUrl: string; readonly cancelUrl: string }): Promise<{ readonly returnUrl: string; readonly cancelUrl: string }> {
  if (returnTo === 'page') return page
  const back = `${(await getServices()).config.publicUrl}${paypalReturnPath(kind)}`
  return { returnUrl: back, cancelUrl: back }
}
