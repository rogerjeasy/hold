'use client'

import { useTranslations } from 'next-intl'
import { linkRoutes } from '@/lib/routes'
import { confirmHold } from './actions'
import { PayPalReturn } from './paypal-return'

// walkIn: the order carried the fee with the hold, so the fee is charged from it (architecture.md section 8.2).
type HoldReturnScreenProps = { token: string; orderId: string; shopName: string; placed: boolean; walkIn?: boolean }

// Where PayPal sends the renter back after approving the hold. The worker authorizes it with PayPal, which is what
// places it. A declined hold reserved nothing, and the renter approves again, perhaps with another way to pay.
export function HoldReturnScreen({ token, orderId, shopName, placed, walkIn = false }: HoldReturnScreenProps) {
  const t = useTranslations('renter.holdPage')
  const walkInText = useTranslations('renter.walkIn')
  const rental = `${linkRoutes.renter}/${token}`
  return (
    <PayPalReturn
      token={token}
      orderId={orderId}
      shopName={shopName}
      done={placed}
      confirm={confirmHold}
      stillWorking={(value) => value.state === 'placing'}
      texts={{ title: t('return.title'), checking: t('return.checking'), done: walkIn ? walkInText('done') : t('return.done'), retry: t('return.retry') }}
      next={{ href: rental, label: t('back') }}
      afterRefusal={{ href: `${rental}/pay`, label: t('return.again'), reasons: ['declined', 'hold_refused'] }}
      wording={{ declined: t('declined') }}
    />
  )
}
