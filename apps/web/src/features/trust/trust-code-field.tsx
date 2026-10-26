'use client'

import { CircleCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { startTransition, useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RenterMessage } from '@/features/renter/renter-message'
import { sendTrustCode } from './renter-actions'

const REASONS = ['code_expired', 'wrong_code', 'code_recently_sent', 'email_unavailable', 'payer_missing', 'renter_unknown'] as const

// The words for each reason a change to the Clean Record was refused.
export function useTrustWording(): Readonly<Record<string, string>> {
  const t = useTranslations('trust.record.results')
  return Object.fromEntries(REASONS.map((reason) => [reason, t(reason)]))
}

// Inside a form that changes the Clean Record: a button that emails the renter a one-time code, and the field to type
// it in. Staff can open a view link at the counter, so the link alone cannot act for the renter (extensions.md 7.6).
export function TrustCodeField({ token }: { token: string }) {
  const t = useTranslations('trust.record')
  const wording = useTrustWording()
  const locale = useLocale()
  const [sent, send, sending] = useActionState(sendTrustCode, null)
  const fieldId = useId()
  const sendCode = () => {
    const data = new FormData()
    data.set('token', token)
    data.set('locale', locale)
    startTransition(() => {
      send(data)
    })
  }
  return (
    <fieldset className="grid justify-items-start gap-3 border-t pt-4">
      <legend className="font-semibold">{t('codeTitle')}</legend>
      <p className="max-w-prose text-muted-foreground">{t('codeLead')}</p>
      <Button type="button" onClick={sendCode} variant="outline" disabled={sending}>
        {sending ? t('sending') : t('sendCode')}
      </Button>
      {sent?.ok === true ? (
        <p role="status" className="flex items-start gap-2">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
          {t('codeSent')}
        </p>
      ) : (
        <RenterMessage result={sent} wording={wording} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={fieldId}>{t('code')}</Label>
        <Input id={fieldId} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required className="max-w-48" />
      </div>
    </fieldset>
  )
}
