'use client'

import { INCIDENT_HINTS, INCIDENT_LIMITS } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { reportIncident } from './renter-actions'

export type ReportableItem = { readonly itemId: string; readonly label: string }

// The first step of "Something happened": which item, what kind of thing, and the renter's own words. They are stored
// before anything else, so nothing the renter wrote is lost if the rest fails.
export function IncidentStartForm({ token, items }: { token: string; items: readonly ReportableItem[] }) {
  const t = useTranslations('renter.incident.start')
  const locale = useLocale()
  const router = useRouter()
  const [result, report, pending] = useActionState(reportIncident, null)
  const [itemId, setItemId] = useState(items[0]?.itemId ?? '')
  useEffect(() => {
    if (result?.ok === true) router.push(linkRoutes.incident(token, result.value.incidentId))
  }, [result, router, token])
  return (
    <form action={report} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {items.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="incident-item">{t('which')}</Label>
          <select id="incident-item" name="itemId" value={itemId} onChange={(event) => { setItemId(event.target.value) }} className="min-h-11 min-w-0 border bg-background px-3">
            {items.map((item) => <option key={item.itemId} value={item.itemId}>{item.label}</option>)}
          </select>
        </div>
      ) : <input type="hidden" name="itemId" value={itemId} />}
      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 font-semibold">{t('what')}</legend>
        {INCIDENT_HINTS.map((hint, index) => (
          <label key={hint} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="hint" value={hint} defaultChecked={index === 0} className="min-h-11 min-w-11 shrink-0" />
            <span className="min-w-0 wrap-long-words">{t(`hints.${hint}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="incident-description">{t('describe')}</Label>
        <Textarea id="incident-description" name="description" required maxLength={INCIDENT_LIMITS.descriptionLength} />
        <p className="text-sm text-muted-foreground">{t('describeHelp')}</p>
      </div>
      <Button type="submit" disabled={pending || itemId === ''} className="min-h-12 justify-self-start whitespace-normal">{t('continue')}</Button>
      <RenterMessage result={result?.ok === true ? null : result} />
    </form>
  )
}
