'use client'

import { useTranslations } from 'next-intl'
import { payFee } from './actions'
import { PayPalButton } from './paypal-button'

// Starts the payment and sends the renter to PayPal, where they approve the fee themselves.
export function PayButton({ token, amount }: { token: string; amount: string }) {
  const t = useTranslations('renter')
  return <PayPalButton token={token} start={payFee} texts={{ go: t('pay', { amount }), going: t('paying'), agree: t('agree') }} />
}
