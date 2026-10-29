'use client'

import { useTranslations } from 'next-intl'
import { PayPalReturn } from '@/features/renter/paypal-return'
import { linkRoutes } from '@/lib/routes'
import { confirmExtension } from './renter-actions'

// Where PayPal sends the renter back after approving more days. The worker captures them; the new end already holds.
export function ExtendedScreen({ token, orderId, shopName, paid }: { token: string; orderId: string; shopName: string; paid: boolean }) {
  const t = useTranslations('extension.extended')
  return (
    <PayPalReturn
      token={token}
      orderId={orderId}
      shopName={shopName}
      done={paid}
      confirm={confirmExtension}
      stillWorking={(value) => value.state === 'capturing'}
      texts={{ title: t('title'), checking: t('checking'), done: t('done'), retry: t('retry') }}
      next={{ href: linkRoutes.extend(token), label: t('back') }}
      afterRefusal={{ href: linkRoutes.extend(token), label: t('again'), reasons: ['quote_stale', 'not_free', 'beyond_hold', 'too_many_days', 'not_out', 'order_mismatch'] }}
    />
  )
}
