'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RenterMessage } from '@/features/renter/renter-message'
import { confirmPhone } from './renter-actions'
import { ShownText } from './shown-text'
import { useContactWording } from './use-contact-wording'
import { useWebOtp } from './use-web-otp'

// The code texted to the number the renter gave. It fills itself in where the phone supports it; in a demo shop the
// text it did not send is shown, with the code to tap in.
export function PhoneConfirmForm({ token, phone, shown, onConfirmed }: { token: string; phone: string; shown: string | null; onConfirmed: (phone: string) => void }) {
  const t = useTranslations('contact')
  const locale = useLocale()
  const wording = useContactWording()
  const codeId = useId()
  const [confirmed, confirm, confirming] = useActionState(confirmPhone, null)
  useWebOtp(codeId, shown === null && confirmed?.ok !== true)
  useEffect(() => {
    if (confirmed?.ok === true) onConfirmed(confirmed.value.phone)
  }, [confirmed, onConfirmed])
  return (
    <form action={confirm} className="grid min-w-0 gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {shown === null ? null : <ShownText body={shown} codeInputId={codeId} />}
      <div className="grid gap-1.5">
        <Label htmlFor={codeId}>{t('codeLabel', { phone })}</Label>
        <Input id={codeId} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} className="sm:max-w-xs" />
      </div>
      <Button type="submit" disabled={confirming} className="min-h-12 justify-self-start whitespace-normal">{t('confirm')}</Button>
      <RenterMessage result={confirmed?.ok === true ? null : confirmed} wording={wording} />
    </form>
  )
}
