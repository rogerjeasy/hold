'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from './renter-message'
import { payFee } from './actions'

// Starts the payment and sends the renter to PayPal, where they approve the fee themselves.
export function PayButton({ token, amount }: { token: string; amount: string }) {
  const t = useTranslations('renter')
  const locale = useLocale()
  const [result, pay, pending] = useActionState(payFee, null)
  useEffect(() => {
    if (result?.ok === true) window.location.assign(result.value.approvalUrl)
  }, [result])
  return (
    <form action={pay} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" disabled={pending || result?.ok === true} className="min-h-12 justify-self-start">
        {pending || result?.ok === true ? t('paying') : t('pay', { amount })}
      </Button>
      <p className="text-sm text-muted-foreground">{t('agree')}</p>
      <RenterMessage result={result?.ok === true ? null : result} />
    </form>
  )
}
