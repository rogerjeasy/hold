'use client'

import { CircleCheck, Lock } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { LinkCode } from '@/features/rentals/link-code'
import { ActionMessage } from '@/features/shop/action-message'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { sealHandover } from './actions'

// Sealing fixes the item's photographs and chains them to its history (architecture.md section 9.2). When the last
// item is sealed, the rental is out and the renter's condition report is shown as a code.
export function SealPanel({ sessionId, rentalId, missing, sealed: alreadySealed }: { sessionId: string; rentalId: string; missing: readonly string[]; sealed: boolean }) {
  const t = useTranslations('shop.handover.seal')
  const locale = useLocale()
  const [sealed, seal, sealing] = useActionState(sealHandover, null)
  if (sealed?.ok === true) {
    return (
      <div className="surface grid animate-pop gap-4 p-4 md:p-5">
        <p role="status" className="flex items-center gap-3 text-lg font-extrabold tracking-tight">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success/12 text-success"><CircleCheck className="size-5" /></span>
          {sealed.value.rentalOut ? t('out') : t('next')}
        </p>
        {sealed.value.conditionLink === undefined ? null : (
          <>
            <p className="text-pretty text-muted-foreground">{sealed.value.conditionLink.sent === 'text' ? t('texted') : sealed.value.conditionLink.sent === 'email' ? t('emailed') : t('show')}</p>
            <LinkCode url={sealed.value.conditionLink.url} qr={sealed.value.conditionLink.qr} scan={t('scan')} />
          </>
        )}
        <Button asChild variant={sealed.value.rentalOut ? 'default' : 'outline'} className="justify-self-start">
          <Link href={rentalRoutes.rental(rentalId)}>{t('back')}</Link>
        </Button>
      </div>
    )
  }
  if (alreadySealed) {
    return (
      <p className="surface flex items-center gap-3 px-4 py-3.5 font-semibold md:px-5">
        <Lock aria-hidden="true" className="size-4.5 shrink-0 text-success" />
        {t('sealedNote')}
      </p>
    )
  }
  return (
    <form action={seal} className="surface flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 md:p-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="max-w-prose min-w-0 flex-[1_1_16rem] text-pretty text-muted-foreground">{missing.length === 0 ? t('ready') : t('missing', { count: missing.length })}</p>
      <Button type="submit" variant={missing.length === 0 ? 'default' : 'outline'} className="min-h-12 max-sm:w-full" disabled={sealing || missing.length > 0}>
        <Lock aria-hidden="true" />
        {t('seal')}
      </Button>
      <div className="basis-full empty:hidden"><ActionMessage result={sealed} success="" results="shop.handover.results" /></div>
    </form>
  )
}
