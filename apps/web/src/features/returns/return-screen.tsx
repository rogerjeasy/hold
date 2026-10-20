'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import type { HandoverView } from '@/features/handover/handover-screen'
import { PhotoTaker } from '@/features/handover/photo-taker'
import { ViewList } from '@/features/handover/view-list'
import { ShopFrame } from '@/features/shop/shop-frame'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link, useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ReturnSeal } from './return-seal'
import { useReturnUpload } from './return-upload'

export type ReturnView = HandoverView & { readonly baseline: HandoverView['photos'] }

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
  return (
    <ShopFrame shopName={shopName} title={session.itemLabel}>
      <div className="grid gap-6">
        <Link href={rentalRoutes.rental(rentalId)} className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
        <p className="max-w-prose text-muted-foreground">{t('guidance')}</p>
        {[...session.photos, ...session.baseline].some((photo) => photo.simulated) ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="min-w-0 max-lg:order-last"><ViewList views={session.plan.map((view) => ({ ...view, done: session.photos.some((photo) => photo.view === view.key) }))} current={current} onChoose={(key) => { setCurrent(key); setRetaking(false) }} /></div>
          {view === undefined ? null : <Panel title={view.label} className="min-w-0"><div className="grid gap-4 px-4 py-4 md:px-5">
            {!session.sealed && canAct && (photo === undefined || retaking) ? <PhotoTaker view={view} upload={upload} onTaken={taken} guide={guide?.url ?? undefined} />
              : photo?.url == null ? <p role="status">{photo === undefined ? t('noPhoto') : t('preparing')}</p>
                : <PhotoWithMarks src={photo.url} alt={t('returnPhoto', { view: view.label })} marks={[]} />}
            {!session.sealed && canAct && photo !== undefined && !retaking ? <Button variant="ghost" className="justify-self-start" onClick={() => { setRetaking(true) }}>{t('retake')}</Button> : null}
          </div></Panel>}
        </div>
        {session.sealed || canAct ? <ReturnSeal rentalId={rentalId} sessionId={session.id} missing={session.missing} sealed={session.sealed} /> : null}
      </div>
    </ShopFrame>
  )
}
