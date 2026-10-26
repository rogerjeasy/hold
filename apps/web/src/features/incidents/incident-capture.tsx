'use client'

import type { ViewOutline } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { ViewList } from '@/features/handover/view-list'
import { useRouter } from '@/i18n/navigation'
import { IncidentSendForm } from './incident-send-form'
import { useIncidentUpload } from './use-incident-upload'

export type CaptureView = { readonly key: string; readonly label: string; readonly outline: ViewOutline }
export type CapturePhoto = { readonly view: string; readonly url: string | null; readonly simulated: boolean }

// The renter photographs what happened, view by view of the item's handover plan, with the handover photograph of that
// view shown faintly to match the angle, as in a return (extensions.md section 10.4). Every view is optional.
export function IncidentCapture({ token, incidentId, views, photos, guides }: { token: string; incidentId: string; views: readonly CaptureView[]; photos: readonly CapturePhoto[]; guides: Readonly<Record<string, string>> }) {
  const t = useTranslations('renter.incident.capture')
  const router = useRouter()
  const [current, setCurrent] = useState(views[0]?.key ?? '')
  const view = views.find((each) => each.key === current)
  const upload = useIncidentUpload(token, incidentId, current)
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-muted-foreground">{t('guidance')}</p>
      {photos.some((photo) => photo.simulated) ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="min-w-0 max-lg:order-last">
          <ViewList views={views.map((each) => ({ ...each, required: false, done: photos.some((photo) => photo.view === each.key) }))} current={current} onChoose={setCurrent} />
        </div>
        {view === undefined ? null : (
          <Panel title={view.label} className="min-w-0">
            <div className="grid gap-4 px-4 py-4 md:px-5">
              <PhotoTaker key={view.key} view={view} upload={upload} onTaken={() => { router.refresh() }} guide={guides[view.key]} />
            </div>
          </Panel>
        )}
      </div>
      <IncidentSendForm token={token} incidentId={incidentId} views={views} photos={photos} />
    </div>
  )
}
