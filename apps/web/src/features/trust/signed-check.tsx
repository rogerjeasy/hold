'use client'

import { checkSigned } from '@hold/trust/check-signed'
import type { SignedCheck as Checked } from '@hold/trust/check-signed'
import type { VerificationKey } from '@hold/trust/verify'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useShopFormat } from '@/hooks/use-shop-format'
import { EvidenceReport } from './evidence-report'
import { RecordCounts } from './record-counts'

// The longest evidence statement Hold signs, with room to spare. A credential is far shorter.
const LONGEST_PASTE = 100_000

// Checks what Hold signed, here in the browser, with Hold's published public key: a Clean Record credential, or an
// evidence statement about a rental's sealed photographs. Nothing is sent anywhere. A renter's code or "Check this
// evidence" opens this page with the token after the #, which never reaches a server.
export function SignedCheck({ keys, timeZone }: { keys: readonly VerificationKey[]; timeZone: string }) {
  const t = useTranslations('trust.verify')
  const format = useShopFormat({ timeZone, currency: null })
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<Checked | null>(null)
  const check = (token: string) => {
    void checkSigned(token, keys, new Date()).then(setChecked)
  }
  // The address the page opened with is read once the page is in the browser.
  useEffect(() => {
    const carried = window.location.hash.slice(1)
    if (carried === '') return
    setText(carried)
    void checkSigned(carried, keys, new Date()).then(setChecked)
  }, [keys])

  const problem = checked === null || checked.result.ok ? null : checked.kind === 'evidence' ? t(`evidence.problems.${checked.result.error}`) : t(`problems.${checked.result.error}`)
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
          <Textarea id="credential" value={text} onChange={(event) => { setText(event.target.value) }} maxLength={LONGEST_PASTE} required aria-describedby="credential-help" className="figures max-h-48 text-sm break-all" />
          <p id="credential-help" className="text-sm text-muted-foreground">{t('pasteHelp')}</p>
        </div>
        <Button type="submit">{t('check')}</Button>
      </form>
      {checked === null ? null : problem !== null ? (
        <p role="alert" className="flex items-start gap-2 text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {problem}
        </p>
      ) : checked.kind === 'evidence' && checked.result.ok ? (
        <EvidenceReport evidence={checked.result.value} />
      ) : checked.kind === 'credential' && checked.result.ok ? (
        <div className="grid gap-4">
          <p role="status" className="flex items-start gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            {t('valid', { time: format.time(checked.result.value.expiresAt) })}
          </p>
          <RecordCounts record={checked.result.value.record} title={t('counts', { months: checked.result.value.record.windowMonths })} />
        </div>
      ) : null}
    </div>
  )
}
