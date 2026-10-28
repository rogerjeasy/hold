'use client'

import { useTranslations } from 'next-intl'
import { payFee } from './actions'
import { PayPalButton } from './paypal-button'
import type { PayPalCheckout } from './paypal-sdk'

// Starts the payment, which the renter approves in PayPal themselves.
export function PayButton({ token, amount, checkout }: { token: string; amount: string; checkout?: PayPalCheckout | undefined }) {
  const t = useTranslations('renter')
  return <PayPalButton token={token} start={payFee} texts={{ go: t('pay', { amount }), going: t('paying'), agree: t('agree') }} {...(checkout === undefined ? {} : { checkout })} />
}
