'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeSent } from '@/features/contact/code-sent'
import { useCodeSender } from '@/features/contact/use-code-sender'
import { sendTrustCode } from './renter-actions'

const REASONS = ['code_expired', 'wrong_code', 'code_recently_sent', 'email_unavailable', 'payer_missing', 'renter_unknown'] as const

// The words for each reason a change to the Clean Record was refused.
export function useTrustWording(): Readonly<Record<string, string>> {
  const t = useTranslations('trust.record.results')
  return Object.fromEntries(REASONS.map((reason) => [reason, t(reason)]))
}

// Inside a form that changes the Clean Record: a button that sends the renter a one-time code, by text or email as
// they chose, and the field to type it in. Staff can open a view link at the counter, so the link alone cannot act for the renter (extensions.md 7.6).
export function TrustCodeField({ token }: { token: string }) {
  const t = useTranslations('trust.record')
  const wording = useTrustWording()
  const locale = useLocale()
  const code = useCodeSender(sendTrustCode, { token, locale })
  const fieldId = useId()
  return (
    <fieldset className="grid justify-items-start gap-3 border-t border-border/70 pt-4">
      <legend className="font-semibold">{t('codeTitle')}</legend>
      <p className="max-w-prose text-muted-foreground">{t('codeLead')}</p>
      <Button type="button" onClick={code.send} variant="outline" disabled={code.pending}>
        {code.pending ? t('sending') : t('sendCode')}
      </Button>
      <CodeSent result={code.result} pending={code.pending} onEmailInstead={code.sendByEmail} codeInputId={fieldId} emailWords={{ sent: t('codeSent'), sandbox: t('codeSent') }} wording={wording} />
      <div className="grid gap-1.5">
        <Label htmlFor={fieldId}>{t('code')}</Label>
        <Input id={fieldId} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required className="figures max-w-48 tracking-[0.2em]" />
      </div>
    </fieldset>
  )
}
