'use client'

import { useTranslations } from 'next-intl'
import { approveHold } from './actions'
import { PayPalButton } from './paypal-button'

// Sends the renter to PayPal, where they approve the hold on their own phone.
export function HoldButton({ token, amount }: { token: string; amount: string }) {
  const t = useTranslations('renter.holdPage')
  return <PayPalButton token={token} start={approveHold} texts={{ go: t('approve', { amount }), going: t('approving'), agree: t('agree') }} />
}
