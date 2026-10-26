'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { answerConsent } from './renter-actions'
import { TrustCodeField, useTrustWording } from './trust-code-field'

type ConsentFormProps = {
  token: string
  consent: { readonly answered: boolean; readonly consented: boolean }
}

// The question asked once, in a sentence, and off until the renter turns it on (extensions.md section 7.6). Once
// answered, the renter may change their mind from any of their links. Each answer needs the renter's emailed code.
export function ConsentForm({ token, consent }: ConsentFormProps) {
  const t = useTranslations('trust.record')
  const wording = useTrustWording()
  const locale = useLocale()
  const [result, answer, pending] = useActionState(answerConsent, null)
  const current = result?.ok === true ? { answered: true, consented: result.value.consented } : consent
  return (
    <form action={answer} className="grid justify-items-start gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {current.answered ? (
        <p role={result?.ok === true ? 'status' : undefined} className="max-w-prose text-pretty">
          {current.consented ? t('consentIsOn') : t('consentIsOff')}
        </p>
      ) : (
        <p className="max-w-prose text-lg text-pretty">{t('consentQuestion')}</p>
      )}
      <TrustCodeField token={token} />
      {current.answered ? (
        <Button type="submit" name="consent" value={current.consented ? 'no' : 'yes'} variant="outline" disabled={pending} className="h-auto max-w-full py-2.5 text-left whitespace-normal">
          {pending ? t('saving') : current.consented ? t('turnOff') : t('turnOn')}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="consent" value="yes" disabled={pending}>
            {t('consentYes')}
          </Button>
          <Button type="submit" name="consent" value="no" variant="outline" disabled={pending}>
            {t('consentNo')}
          </Button>
        </div>
      )}
      <RenterMessage result={result} wording={wording} />
    </form>
  )
}
