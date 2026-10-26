'use client'

import { checkReportedRegion } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { RegionBox } from '@/components/region-box'
import { Button } from '@/components/ui/button'
import { useDraftBox } from '@/features/handover/use-draft-box'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import type { CapturePhoto, CaptureView } from './incident-capture'
import { sendIncidentReport } from './renter-actions'

// Sends the report. On a photograph, the renter may box where the damage is: that box becomes the mark the return is
// checked against, so it is kept small, around the damage alone. Sending closes the photographs.
export function IncidentSendForm({ token, incidentId, views, photos }: { token: string; incidentId: string; views: readonly CaptureView[]; photos: readonly CapturePhoto[] }) {
  const t = useTranslations('renter.incident.send')
  const locale = useLocale()
  const router = useRouter()
  const draft = useDraftBox()
  const [result, send, pending] = useActionState(sendIncidentReport, null)
  const shown = photos.filter((photo) => photo.url !== null)
  const [boxView, setBoxView] = useState(shown[0]?.view ?? '')
  const photo = shown.find((each) => each.view === boxView) ?? shown[0]
  const tooLarge = draft.box !== undefined && !checkReportedRegion(draft.box)
  useEffect(() => {
    if (result?.ok === true) router.refresh()
  }, [result, router])
  return (
    <form action={send} className="grid gap-4 border-t pt-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="incidentId" value={incidentId} />
      {photo === undefined ? <p className="text-muted-foreground">{t('noPhotos')}</p> : (
        <div className="grid gap-3">
          {shown.length > 1 ? (
            <label className="grid gap-1.5">
              <span className="font-semibold">{t('whichPhoto')}</span>
              <select value={photo.view} onChange={(event) => { setBoxView(event.target.value); draft.clear() }} className="min-h-11 min-w-0 border bg-background px-3">
                {shown.map((each) => <option key={each.view} value={each.view}>{views.find((view) => view.key === each.view)?.label ?? each.view}</option>)}
              </select>
            </label>
          ) : null}
          <div className="max-w-xl">
            <PhotoWithMarks src={photo.url ?? ''} alt={t('photo')} marks={[]}>
              {draft.box === undefined ? null : <RegionBox region={draft.box} role="slider" tabIndex={0} aria-label={t('box')} aria-valuetext={t('boxAt', { x: Math.round(draft.box.x * 100), y: Math.round(draft.box.y * 100) })} className="cursor-move touch-none border-primary bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2" {...draft.handlers} />}
            </PhotoWithMarks>
          </div>
          {draft.box === undefined ? (
            <Button type="button" variant="outline" className="min-h-11 justify-self-start whitespace-normal" onClick={draft.place}>{t('markIt')}</Button>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">{t('howTo')}</p>
              {tooLarge ? <p role="alert" className="text-destructive">{t('tooLarge')}</p> : null}
              <Button type="button" variant="ghost" className="min-h-11 justify-self-start" onClick={draft.clear}>{t('removeBox')}</Button>
              <input type="hidden" name="view" value={photo.view} />
              {(['x', 'y', 'width', 'height'] as const).map((field) => <input key={field} type="hidden" name={field} value={String(draft.box?.[field] ?? 0)} />)}
            </div>
          )}
        </div>
      )}
      <Button type="submit" disabled={pending || tooLarge} className="min-h-12 justify-self-start whitespace-normal">{pending ? t('sending') : t('send')}</Button>
      <RenterMessage result={result?.ok === true ? null : result} wording={{ region_invalid: t('tooLarge') }} />
    </form>
  )
}
