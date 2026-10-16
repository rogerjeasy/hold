'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from './action-message'
import { turnOnPayPalNotifications } from './actions'

// For a shop connected before Hold listened to PayPal: subscribes its webhook address.
export function TurnOnNotifications() {
  const t = useTranslations('shop.paypal')
  const locale = useLocale()
  const [result, turnOn, pending] = useActionState(turnOnPayPalNotifications, null)
  return (
    <form action={turnOn} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {pending ? t('turningOn') : t('turnOn')}
      </Button>
      <ActionMessage result={result} success={t('turnedOn')} />
    </form>
  )
}
