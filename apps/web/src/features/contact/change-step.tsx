'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { CodeSent } from './code-sent'
import { PhoneForm } from './phone-form'
import type { PhoneCodeSent } from './phone-form'
import { sendContactChangeCode } from './renter-actions'

// Once the hold is placed, a new number starts with a code sent where the renter's codes go now: the phone they
// confirmed, or the email PayPal gave. Whoever has only the link cannot get past this.
export function ChangeStep({ token, onSent }: { token: string; onSent: (sent: PhoneCodeSent) => void }) {
  const t = useTranslations('contact')
  const locale = useLocale()
  const [sent, send, sending] = useActionState(sendContactChangeCode, null)
  return (
    <div className="grid min-w-0 gap-4">
      <form action={send} className="grid gap-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <p className="max-w-prose">{t('changeLead')}</p>
        <Button type="submit" variant={sent?.ok === true ? 'outline' : 'default'} disabled={sending} className="min-h-12 justify-self-start whitespace-normal">{t('sendChangeCode')}</Button>
        <CodeSent result={sent} pending={sending} codeInputId="" emailWords={{ sent: t('changeCodeEmailed'), sandbox: t('changeCodeEmailed') }} />
      </form>
      {sent?.ok === true ? <PhoneForm token={token} changing onSent={onSent} /> : null}
    </div>
  )
}
