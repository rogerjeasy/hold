import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { linkRoutes } from '@/lib/routes'
import type { SelfReturnData } from '@/server/self-return-page'
import { ReturnCapture } from './return-capture'
import { ReturnIntro } from './return-intro'
import { ReturnReceipt } from './return-receipt'

// The renter returns the item with nobody at the counter (architecture.md section 6.13): first where to leave it and
// what happens next, then the photographs, then a receipt that stays.
export function RenterReturnScreen({ token, data }: { token: string; data: SelfReturnData }) {
  const t = useTranslations('selfReturn.renter')
  const promise = { shopName: data.shopName, opening: data.opening, timeZone: data.timeZone, currency: data.currency, holdCents: data.hold?.reservedCents ?? null }
  return (
    <RenterPage>
      <RenterHead shopName={data.shopName} simulated={data.simulated} title={t(`titles.${data.stage}`)} />
      {data.stage === 'unavailable' ? <Notice title={t('unavailable.title')} body={t('unavailable.body', { shop: data.shopName })} /> : null}
      {data.stage === 'intro' ? <ReturnIntro token={token} canAct={data.canAct} dropPoint={data.dropPoint} promise={promise} /> : null}
      {data.stage === 'capture' ? (data.canAct ? <ReturnCapture token={token} items={data.items} /> : <p role="note" className="text-muted-foreground">{t('intro.noScope')}</p>) : null}
      {data.stage === 'sent' && data.droppedOffAt !== null ? <ReturnReceipt token={token} promise={promise} data={{ ...data, droppedOffAt: data.droppedOffAt }} /> : null}
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('back')}</BackLink>
    </RenterPage>
  )
}
