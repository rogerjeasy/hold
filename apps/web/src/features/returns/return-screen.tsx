'use client'

import { Aperture, LoaderCircle, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { BackLink } from '@/components/ui/back-link'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { CaptureProgress } from '@/features/handover/capture-progress'
import type { HandoverView } from '@/features/handover/handover-screen'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { ViewList } from '@/features/handover/view-list'
import { ShopFrame } from '@/features/shop/shop-frame'
import { useLookAgain } from '@/hooks/use-look-again'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ReturnSeal } from './return-seal'
import { useReturnUpload } from './return-upload'

export type ReturnView = HandoverView & { readonly baseline: HandoverView['photos'] }

// One item's return: each handover view photographed again, the handover photograph
// laid faintly over the camera to match the angle, then sealed for the comparison.
export function ReturnScreen({ shopName, rentalId, session, canAct }: { shopName: string; rentalId: string; session: ReturnView; canAct: boolean }) {
  const t = useTranslations('shop.returns')
  const router = useRouter()
  const [current, setCurrent] = useState(session.missing[0] ?? session.plan[0]?.key ?? '')
  const [retaking, setRetaking] = useState(false)
  const view = session.plan.find((view) => view.key === current)
  const photo = session.photos.find((photo) => photo.view === current)
  const guide = session.baseline.find((photo) => photo.view === current)
  const upload = useReturnUpload(session.id, current)
  useLookAgain([...session.photos, ...session.baseline].some((photo) => photo.url === null))
  const taken = () => {
    setRetaking(false)
    const next = session.missing.find((key) => key !== current)
    if (next !== undefined) setCurrent(next)
    router.refresh()
  }
  const done = session.plan.filter((each) => session.photos.some((photo) => photo.view === each.key)).length
  return (
    <ShopFrame shopName={shopName} title={session.itemLabel} description={t('guidance')} actions={<BackLink href={rentalRoutes.rental(rentalId)}>{t('back')}</BackLink>}>
      <div className="grid gap-6">
        {[...session.photos, ...session.baseline].some((photo) => photo.simulated) ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
        <div className="surface px-4 py-4 md:px-5"><CaptureProgress done={done} total={session.plan.length} /></div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-6">
          <div className="min-w-0 lg:sticky lg:top-6"><ViewList views={session.plan.map((view) => ({ ...view, done: session.photos.some((photo) => photo.view === view.key) }))} current={current} onChoose={(key) => { setCurrent(key); setRetaking(false) }} /></div>
          {view === undefined ? null : (
            <Panel title={view.label} icon={Aperture} className="min-w-0">
              <div key={view.key} className="grid animate-fade gap-4 p-3 sm:p-4 md:p-5">
                {!session.sealed && canAct && (photo === undefined || retaking) ? <PhotoTaker view={view} upload={upload} onTaken={taken} guide={guide?.url ?? undefined} returnSamples />
                  : photo?.url == null ? (
                    <p role="status" className="grid aspect-thumbnail place-items-center rounded-2xl bg-muted px-4 text-center text-muted-foreground">
                      <span className="flex items-center gap-2">{photo === undefined ? null : <LoaderCircle aria-hidden="true" className="size-4.5 animate-spin" />}{photo === undefined ? t('noPhoto') : t('preparing')}</span>
                    </p>
                  )
                    : <PhotoWithMarks src={photo.url} alt={t('returnPhoto', { view: view.label })} marks={[]} />}
                {!session.sealed && canAct && photo !== undefined && !retaking ? <Button variant="ghost" className="justify-self-start" onClick={() => { setRetaking(true) }}><RotateCcw aria-hidden="true" />{t('retake')}</Button> : null}
              </div>
            </Panel>
          )}
        </div>
        {session.sealed || canAct ? <ReturnSeal rentalId={rentalId} sessionId={session.id} missing={session.missing} sealed={session.sealed} /> : null}
      </div>
    </ShopFrame>
  )
}
