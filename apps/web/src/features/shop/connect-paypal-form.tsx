'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/features/auth/form-field'
import { ActionMessage } from './action-message'
import { connectPayPal } from './actions'

// The REST credentials of one PayPal sandbox app. They go to the server once, are checked with PayPal, and are
// kept in Secrets Manager. The page never shows them again.
export function ConnectPayPalForm() {
  const t = useTranslations('shop.paypal')
  const locale = useLocale()
  const [result, connect, pending] = useActionState(connectPayPal, null)

  return (
    <form action={connect} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      <FormField name="clientId" label={t('clientId')} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200} required />
      <FormField name="clientSecret" label={t('clientSecret')} type="password" autoComplete="off" maxLength={200} required />
      <Button type="submit" disabled={pending} className="min-h-12 justify-self-start">
        {pending ? t('checking') : t('connect')}
      </Button>
      <ActionMessage result={result} success={t('connected')} />
    </form>
  )
}
