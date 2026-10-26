'use client'

import type { Result } from '@hold/domain'
import { verifyCredential } from '@hold/trust/verify'
import type { CredentialProblem, VerificationKey, VerifiedCredential } from '@hold/trust/verify'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useShopFormat } from '@/hooks/use-shop-format'
import { RecordCounts } from './record-counts'

// Checks a Clean Record credential here, in the browser, with Hold's published public key: nothing is sent anywhere.
// The renter's code opens this page with the credential after the #, which never reaches a server.
export function CredentialCheck({ keys, timeZone }: { keys: readonly VerificationKey[]; timeZone: string }) {
  const t = useTranslations('trust.verify')
  const format = useShopFormat({ timeZone, currency: null })
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<Result<VerifiedCredential, CredentialProblem> | null>(null)
  const check = (token: string) => {
    void verifyCredential(token, keys, new Date()).then(setChecked)
  }
  // The address the page opened with is read once the page is in the browser.
  useEffect(() => {
    const carried = window.location.hash.slice(1)
    if (carried === '') return
    setText(carried)
    void verifyCredential(carried, keys, new Date()).then(setChecked)
  }, [keys])

  return (
    <div className="grid gap-6">
      <form
        className="grid justify-items-start gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          check(text)
        }}
      >
        <div className="grid w-full gap-1.5">
          <Label htmlFor="credential">{t('paste')}</Label>
          <Textarea id="credential" value={text} onChange={(event) => { setText(event.target.value) }} maxLength={2000} required aria-describedby="credential-help" className="figures text-sm break-all" />
          <p id="credential-help" className="text-sm text-muted-foreground">{t('pasteHelp')}</p>
        </div>
        <Button type="submit">{t('check')}</Button>
      </form>
      {checked === null ? null : checked.ok ? (
        <div className="grid gap-4">
          <p role="status" className="flex items-start gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            {t('valid', { time: format.time(checked.value.expiresAt) })}
          </p>
          <RecordCounts record={checked.value.record} title={t('counts', { months: checked.value.record.windowMonths })} />
        </div>
      ) : (
        <p role="alert" className="flex items-start gap-2 text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {t(`problems.${checked.error}`)}
        </p>
      )}
    </div>
  )
}
