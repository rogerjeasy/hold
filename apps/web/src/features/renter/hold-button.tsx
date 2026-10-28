'use client'

import { useTranslations } from 'next-intl'
import { approveHold } from './actions'
import { PayPalButton } from './paypal-button'
import type { PayPalCheckout } from './paypal-sdk'

// Asks the renter to approve the hold in PayPal, on their own phone.
export function HoldButton({ token, amount, checkout }: { token: string; amount: string; checkout?: PayPalCheckout | undefined }) {
  const t = useTranslations('renter.holdPage')
  return <PayPalButton token={token} start={approveHold} texts={{ go: t('approve', { amount }), going: t('approving'), agree: t('agree') }} {...(checkout === undefined ? {} : { checkout })} />
}
