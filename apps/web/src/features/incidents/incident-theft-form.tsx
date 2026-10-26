'use client'

import type { TheftDetails } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import { givePoliceReport, giveTheftDetails } from './renter-actions'

const FIELDS = ['where', 'when', 'lockAndKeys'] as const

// The fixed steps of a theft or loss: where, when, the lock and keys, then a police report number, which may come
// later. Given once; what the renter wrote is kept as they wrote it.
export function IncidentTheftForm({ token, incidentId, details }: { token: string; incidentId: string; details: TheftDetails | null }) {
  const t = useTranslations('renter.incident.theft')
  const locale = useLocale()
  const router = useRouter()
  const [given, give, giving] = useActionState(giveTheftDetails, null)
  const [reported, report, reporting] = useActionState(givePoliceReport, null)
  useEffect(() => {
    if (given?.ok === true || reported?.ok === true) router.refresh()
  }, [given, reported, router])
  const hidden = <><input type="hidden" name="token" value={token} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="incidentId" value={incidentId} /></>
  if (details === null) {
    return (
      <form action={give} className="grid gap-4">
        {hidden}
        {FIELDS.map((field) => (
          <div key={field} className="grid gap-1.5">
            <Label htmlFor={`theft-${field}`}>{t(field)}</Label>
            <Input id={`theft-${field}`} name={field} required maxLength={300} />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="theft-police">{t('policeReport')}</Label>
          <Input id="theft-police" name="policeReport" maxLength={300} />
          <p className="text-sm text-muted-foreground">{t('policeLater')}</p>
        </div>
        <Button type="submit" disabled={giving} className="min-h-12 justify-self-start whitespace-normal">{t('send')}</Button>
        <RenterMessage result={given?.ok === true ? null : given} />
      </form>
    )
  }
  return (
    <div className="grid gap-4">
      <dl className="grid gap-2">
        {[...FIELDS, 'policeReport' as const].map((field) => (
          <div key={field} className="grid min-w-0 gap-0.5">
            <dt className="text-sm text-muted-foreground">{t(field)}</dt>
            <dd className="whitespace-pre-wrap wrap-long-words">{details[field] === '' ? t('notGiven') : details[field]}</dd>
          </div>
        ))}
      </dl>
      {details.policeReport === '' ? (
        <form action={report} className="grid gap-3">
          {hidden}
          <Label htmlFor="theft-police-later">{t('policeReport')}</Label>
          <Input id="theft-police-later" name="policeReport" required maxLength={300} />
          <Button type="submit" disabled={reporting} className="min-h-12 justify-self-start whitespace-normal">{t('addPolice')}</Button>
          <RenterMessage result={reported?.ok === true ? null : reported} />
        </form>
      ) : null}
    </div>
  )
}
