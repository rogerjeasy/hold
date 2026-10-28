'use client'

import { useTranslations } from 'next-intl'
import { approveHold } from './actions'
import { PayPalButton } from './paypal-button'
import type { PayPalCheckout } from './paypal-sdk'

// A walk-in pays the fee and approves the hold together, in one PayPal approval (architecture.md section 8.2).
export function WalkInButton({ token, fee, hold, checkout }: { token: string; fee: string; hold: string; checkout?: PayPalCheckout | undefined }) {
  const t = useTranslations('renter.walkIn')
  return <PayPalButton token={token} start={approveHold} texts={{ go: t('approve', { fee, hold }), going: t('approving'), agree: t('agree') }} {...(checkout === undefined ? {} : { checkout })} />
}
