'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RenterMessage } from '@/features/renter/renter-message'
import { sendPhoneCode } from './renter-actions'
import { useCallingCode } from './use-calling-code'
import { useContactWording } from './use-contact-wording'

export type PhoneCodeSent = { readonly phone: string; readonly confirmed: boolean; readonly shown: string | null }

// The renter's number, with its country code filled in from the phone's region, and a code texted to it. Once the
// hold is placed, `changeCode` carries the code from the channel trusted now, without which the number cannot move.
export function PhoneForm({ token, changing, onSent }: { token: string; changing: boolean; onSent: (sent: PhoneCodeSent) => void }) {
  const t = useTranslations('contact')
  const locale = useLocale()
  const wording = useContactWording()
  const prefix = useCallingCode()
  const phoneField = useRef<HTMLInputElement>(null)
  // The country code goes in only while the field is empty, so it never replaces what the renter has typed.
  useEffect(() => {
    if (phoneField.current !== null && phoneField.current.value === '') phoneField.current.value = prefix
  }, [prefix])
  const phoneId = useId()
  const changeId = useId()
  const [sent, send, sending] = useActionState(sendPhoneCode, null)
  useEffect(() => {
    if (sent?.ok === true) onSent(sent.value)
  }, [sent, onSent])
  return (
    <form action={send} className="grid min-w-0 gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {changing ? (
        <div className="grid gap-1.5">
          <Label htmlFor={changeId}>{t('changeCodeLabel')}</Label>
          <Input id={changeId} name="changeCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} className="sm:max-w-xs" />
        </div>
      ) : <input type="hidden" name="changeCode" value="" />}
      <div className="grid gap-1.5">
        <Label htmlFor={phoneId}>{changing ? t('newPhoneLabel') : t('phoneLabel')}</Label>
        <Input ref={phoneField} id={phoneId} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} required className="sm:max-w-xs" />
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{t('privacy')}</p>
      <Button type="submit" disabled={sending} className="min-h-12 justify-self-start whitespace-normal">{t('sendCode')}</Button>
      <RenterMessage result={sent?.ok === true ? null : sent} wording={wording} />
    </form>
  )
}
