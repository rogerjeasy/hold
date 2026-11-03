'use client'
import type { Region } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import type { HandoverView } from '@/features/handover/handover-screen'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { ViewList } from '@/features/handover/view-list'
import { useRouter } from '@/i18n/navigation'
import { useRepairUpload } from './repair-upload'

export type RepairGuide = { readonly view: string; readonly url: string | null; readonly region: Region | null; readonly description: string }

// Each marked view in turn: the photograph the mark was found on, boxed, beside the camera framed the same way.
export function RepairCapture({ session, guides, canAct }: { session: HandoverView; guides: readonly RepairGuide[]; canAct: boolean }) {
  const t = useTranslations('repairs.page')
  const router = useRouter()
  const [current, setCurrent] = useState(session.missing[0] ?? session.plan[0]?.key ?? '')
  const [retaking, setRetaking] = useState(false)
  const view = session.plan.find((each) => each.key === current)
  const photo = session.photos.find((each) => each.view === current)
  const shown = guides.filter((guide) => guide.view === current)
  const upload = useRepairUpload(session.id, current)
  const taken = () => {
    setRetaking(false)
    const next = session.missing.find((key) => key !== current)
    if (next !== undefined) setCurrent(next)
    router.refresh()
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-6">
      <div className="min-w-0 lg:sticky lg:top-6"><ViewList views={session.plan.map((each) => ({ ...each, done: session.photos.some((shot) => shot.view === each.key) }))} current={current} onChoose={(key) => { setCurrent(key); setRetaking(false) }} /></div>
      {view === undefined ? null : (
        <Panel title={view.label} className="min-w-0">
          <div className="grid gap-4 p-3 sm:p-4 md:p-5 xl:grid-cols-2">
            <div className="grid min-w-0 content-start gap-2">
              <p className="label text-xs text-muted-foreground">{t('where')}</p>
              {shown.map((guide) => guide.url === null ? <p key={guide.description} className="text-muted-foreground">{guide.description}</p> : <PhotoWithMarks key={guide.description} src={guide.url} alt={t('whereAlt', { mark: guide.description })} marks={guide.region === null ? [] : [{ id: guide.description, region: guide.region, confirmed: true }]} />)}
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <p className="label text-xs text-muted-foreground">{t('now')}</p>
              {!session.sealed && canAct && (photo === undefined || retaking) ? <PhotoTaker view={view} upload={upload} onTaken={taken} guide={shown[0]?.url ?? undefined} />
                : photo?.url == null ? <p role="status">{photo === undefined ? t('noPhoto') : t('preparing')}</p>
                  : <PhotoWithMarks src={photo.url} alt={t('nowAlt', { view: view.label })} marks={[]} />}
              {!session.sealed && canAct && photo !== undefined && !retaking ? <Button variant="ghost" className="justify-self-start" onClick={() => { setRetaking(true) }}>{t('retake')}</Button> : null}
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
