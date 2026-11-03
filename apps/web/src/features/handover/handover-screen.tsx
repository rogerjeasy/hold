'use client'

import type { SessionMark } from '@hold/db'
import type { ViewOutline } from '@hold/domain'
import { Aperture, LoaderCircle, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { BackLink } from '@/components/ui/back-link'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ShopFrame } from '@/features/shop/shop-frame'
import { useLookAgain } from '@/hooks/use-look-again'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { CaptureProgress } from './capture-progress'
import { MarkEditor } from './mark-editor'
import { PhotoTaker } from './photo-taker'
import { SealPanel } from './seal-panel'
import { useStaffUpload } from './staff-upload'
import { ViewList } from './view-list'

export type HandoverView = {
  readonly id: string
  readonly itemLabel: string
  readonly sealed: boolean
  readonly plan: readonly { readonly key: string; readonly label: string; readonly outline: ViewOutline; readonly required: boolean }[]
  // A photograph's display copy, or null while the worker makes it.
  readonly photos: readonly { readonly view: string; readonly url: string | null; readonly simulated?: boolean }[]
  readonly marks: readonly SessionMark[]
  readonly missing: readonly string[]
}

// One item's guided handover (architecture.md section 11.2): each view photographed in turn, its marks boxed and
// confirmed, then sealed.
export function HandoverScreen({ shopName, rentalId, session }: { shopName: string; rentalId: string; session: HandoverView }) {
  const t = useTranslations('shop.handover')
  const router = useRouter()
  const [current, setCurrent] = useState(session.missing[0] ?? session.plan[0]?.key ?? '')
  const [retaking, setRetaking] = useState(false)
  const view = session.plan.find((each) => each.key === current)
  const photo = session.photos.find((each) => each.view === current)
  const upload = useStaffUpload(session.id, current)
  // Display copies are made by the worker within seconds; the page looks again until they are.
  useLookAgain(session.photos.some((each) => each.url === null))
  const taken = () => {
    setRetaking(false)
    const next = session.missing.find((key) => key !== current)
    if (next !== undefined) setCurrent(next)
    router.refresh()
  }

  const done = session.plan.filter((each) => session.photos.some((taken) => taken.view === each.key)).length

  return (
    <ShopFrame shopName={shopName} title={session.itemLabel} description={t('lead')} actions={<BackLink href={rentalRoutes.rental(rentalId)}>{t('back')}</BackLink>}>
      <div className="grid gap-6">
        <div className="surface px-4 py-4 md:px-5"><CaptureProgress done={done} total={session.plan.length} /></div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-6">
          {/* On a phone the views are a row of chips above the camera; from lg, a list beside it that stays in view. */}
          <div className="min-w-0 lg:sticky lg:top-6">
            <ViewList views={session.plan.map((each) => ({ ...each, done: session.photos.some((taken) => taken.view === each.key) }))} current={current} onChoose={(key) => { setCurrent(key); setRetaking(false) }} />
          </div>
          {view === undefined ? null : (
            <Panel title={view.label} icon={Aperture} className="min-w-0">
              <div key={view.key} className="grid animate-fade gap-4 p-3 sm:p-4 md:p-5">
                {session.sealed || (photo !== undefined && !retaking) ? (
                  photo === undefined ? null : photo.url === null ? (
                    <p role="status" className="grid aspect-thumbnail place-items-center rounded-2xl skeleton text-muted-foreground">
                      <span className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4.5 animate-spin" />{t('preparing')}</span>
                    </p>
                  ) : (
                    <MarkEditor sessionId={session.id} view={view.key} photoUrl={photo.url} marks={session.marks.filter((mark) => mark.view === view.key)} readOnly={session.sealed} />
                  )
                ) : (
                  <PhotoTaker view={view} upload={upload} onTaken={taken} />
                )}
                {!session.sealed && photo !== undefined && !retaking ? (
                  <Button type="button" variant="ghost" className="justify-self-start" onClick={() => { setRetaking(true) }}>
                    <RotateCcw aria-hidden="true" />
                    {t('retake')}
                  </Button>
                ) : null}
              </div>
            </Panel>
          )}
        </div>
        {/* Kept on the page once sealed, so the renter's code it shows stays when the page is drawn again. */}
        <SealPanel sessionId={session.id} rentalId={rentalId} missing={session.missing} sealed={session.sealed} />
      </div>
    </ShopFrame>
  )
}
