'use client'

import { DROP_POINT_VIEW } from '@hold/domain'
import type { ViewOutline } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { ViewList } from '@/features/handover/view-list'
import { useLookAgain } from '@/hooks/use-look-again'
import { useRouter } from '@/i18n/navigation'
import { SendReturnForm } from './send-return-form'
import { useSelfReturnUpload } from './use-self-return-upload'

// The demonstration's photograph of an e-bike left at a drop point, said to be a sample on screen and in the record.
const DROP_POINT_SAMPLE = '/images/sample-drop-point.jpg'

export type ReturnItem = {
  readonly sessionId: string
  readonly label: string
  readonly views: readonly { readonly key: string; readonly label: string; readonly outline: ViewOutline }[]
  readonly missing: readonly string[]
  readonly photos: readonly { readonly view: string; readonly url: string | null; readonly simulated: boolean }[]
  // The handover photograph of each view, shown faintly behind the camera to match the angle.
  readonly guides: Readonly<Record<string, string>>
}

// One item's photographs: each view of its handover with the handover photograph behind the camera, then where it was
// left. The phone checks each one before it uploads, and the server refuses one that repeats earlier evidence, so the
// renter learns at the drop point, not the next morning, that a photograph cannot be used.
function ItemCapture({ token, item, showLabel }: { token: string; item: ReturnItem; showLabel: boolean }) {
  const t = useTranslations('selfReturn.renter.capture')
  const router = useRouter()
  const [current, setCurrent] = useState(item.missing[0] ?? item.views[0]?.key ?? '')
  const [retaking, setRetaking] = useState(false)
  const labelOf = (key: string, label: string) => (key === DROP_POINT_VIEW ? t('dropPointView') : label)
  const view = item.views.find((each) => each.key === current)
  const photo = item.photos.find((each) => each.view === current)
  const upload = useSelfReturnUpload(token, item.sessionId, current)
  const taken = () => {
    setRetaking(false)
    const next = item.missing.find((key) => key !== current)
    if (next !== undefined) setCurrent(next)
    router.refresh()
  }
  return (
    <section aria-label={item.label} className="grid gap-4">
      {showLabel ? <h2 className="text-[1.0625rem] font-extrabold tracking-tight wrap-long-words">{item.label}</h2> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="min-w-0 max-lg:order-last">
          <ViewList views={item.views.map((each) => ({ key: each.key, label: labelOf(each.key, each.label), required: true, done: item.photos.some((taken) => taken.view === each.key) }))} current={current} onChoose={(key) => { setCurrent(key); setRetaking(false) }} />
        </div>
        {view === undefined ? null : (
          <Panel title={labelOf(view.key, view.label)} className="min-w-0">
            <div className="grid gap-4 px-4 py-4 md:px-5">
              {view.key === DROP_POINT_VIEW ? <p className="text-muted-foreground">{t('dropPointGuidance')}</p> : null}
              {photo === undefined || retaking ? (
                <PhotoTaker key={view.key} view={view} upload={upload} onTaken={taken} guide={view.key === DROP_POINT_VIEW ? undefined : item.guides[view.key]} returnSamples={view.key !== DROP_POINT_VIEW} {...(view.key === DROP_POINT_VIEW ? { sample: DROP_POINT_SAMPLE } : {})} />
              ) : photo.url === null ? (
                <p role="status">{t('preparing')}</p>
              ) : (
                <PhotoWithMarks src={photo.url} alt={t('photo', { view: labelOf(view.key, view.label) })} marks={[]} />
              )}
              {photo !== undefined && !retaking ? <Button variant="outline" className="min-h-12 justify-self-start" onClick={() => { setRetaking(true) }}>{t('retake')}</Button> : null}
            </div>
          </Panel>
        )}
      </div>
    </section>
  )
}

export function ReturnCapture({ token, items }: { token: string; items: readonly ReturnItem[] }) {
  const t = useTranslations('selfReturn.renter.capture')
  const photos = items.flatMap((item) => item.photos)
  useLookAgain(photos.some((photo) => photo.url === null))
  const missing = items.reduce((count, item) => count + item.missing.length, 0)
  return (
    <div className="grid gap-8">
      <p className="max-w-prose text-muted-foreground">{t('guidance')}</p>
      {photos.some((photo) => photo.simulated) ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
      {items.map((item) => <ItemCapture key={item.sessionId} token={token} item={item} showLabel={items.length > 1} />)}
      <SendReturnForm token={token} missing={missing} />
    </div>
  )
}
