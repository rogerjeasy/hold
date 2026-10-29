import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { Link } from '@/i18n/navigation'
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
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label flex items-center gap-2 text-xs text-muted-foreground wrap-long-words">
          {data.shopName}
          {data.simulated ? <SampleTag /> : null}
        </p>
        <h1 className="text-page-title text-balance wrap-long-words">{t(`titles.${data.stage}`)}</h1>
        <Link href={`${linkRoutes.renter}/${token}`} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('back')}
        </Link>
      </header>
      {data.stage === 'unavailable' ? <Notice title={t('unavailable.title')} body={t('unavailable.body', { shop: data.shopName })} /> : null}
      {data.stage === 'intro' ? <ReturnIntro token={token} canAct={data.canAct} dropPoint={data.dropPoint} promise={promise} /> : null}
      {data.stage === 'capture' ? (data.canAct ? <ReturnCapture token={token} items={data.items} /> : <p role="note" className="text-muted-foreground">{t('intro.noScope')}</p>) : null}
      {data.stage === 'sent' && data.droppedOffAt !== null ? <ReturnReceipt token={token} promise={promise} data={{ ...data, droppedOffAt: data.droppedOffAt }} /> : null}
    </div>
  )
}
