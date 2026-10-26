'use client'

import { CircleCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { deleteRecord } from './renter-actions'
import { TrustCodeField, useTrustWording } from './trust-code-field'

// Deleting the record, from any rental link, returns the renter to the ordinary hold at every Hold shop. The box must
// be ticked first, so it is never one stray tap, and the renter's emailed code given, so nobody else can.
export function DeleteRecordForm({ token }: { token: string }) {
  const t = useTranslations('trust.record')
  const wording = useTrustWording()
  const locale = useLocale()
  const [result, remove, pending] = useActionState(deleteRecord, null)
  if (result?.ok === true) {
    return (
      <p role="status" className="flex items-start gap-2 font-semibold">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
        {t('deleted')}
      </p>
    )
  }
  return (
    <form action={remove} className="grid justify-items-start gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <p className="max-w-prose text-muted-foreground">{t('deleteLead')}</p>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="understood" value="yes" required className="min-h-11 min-w-11 shrink-0 accent-primary" />
        <span className="self-center text-pretty">{t('deleteConfirm')}</span>
      </label>
      <TrustCodeField token={token} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? t('deleting') : t('delete')}
      </Button>
      <RenterMessage result={result} wording={wording} />
    </form>
  )
}
