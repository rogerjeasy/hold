'use client'

import { useTranslations } from 'next-intl'
import { linkRoutes } from '@/lib/routes'
import { confirmFee } from './actions'
import { PayPalReturn } from './paypal-return'

// `booked` is what the server last read: the page is drawn again while the worker captures, until it says booked.
type PaidScreenProps = { token: string; orderId: string; shopName: string; booked: boolean }

// Where PayPal sends the renter back after approving the fee. The worker captures it with PayPal, which is what books
// the rental.
export function PaidScreen({ token, orderId, shopName, booked }: PaidScreenProps) {
  const t = useTranslations('renter.paid')
  return (
    <PayPalReturn
      token={token}
      orderId={orderId}
      shopName={shopName}
      done={booked}
      confirm={confirmFee}
      stillWorking={(value) => value.state === 'capturing'}
      texts={{ title: t('title'), checking: t('checking'), done: t('done'), retry: t('retry') }}
      next={{ href: `${linkRoutes.renter}/${token}`, label: t('back') }}
    />
  )
}
