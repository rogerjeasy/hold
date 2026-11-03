'use client'

import { ArrowRight, Lock, ScanSearch } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { sealReturn } from './actions'

// Sealing the return photographs starts the comparison; once sealed, the way on is the comparison itself.
export function ReturnSeal({ rentalId, sessionId, missing, sealed }: { rentalId: string; sessionId: string; missing: readonly string[]; sealed: boolean }) {
  const t = useTranslations('shop.returns')
  const locale = useLocale()
  const [result, seal, pending] = useActionState(sealReturn, null)
  if (sealed || result?.ok === true) {
    const comparisonId = result?.ok === true ? result.value.comparisonId : null
    return (
      <div className="surface grid animate-pop gap-4 p-4 md:p-5">
        <p role="status" className="flex items-start gap-3 text-pretty">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success/12 text-success"><ScanSearch className="size-5" /></span>
          <span className="min-w-0 self-center">{t('sealedNote')}</span>
        </p>
        {comparisonId !== null ? (
          <Button asChild className="justify-self-start"><Link href={rentalRoutes.comparison(rentalId, comparisonId)}>{t('review')}<ArrowRight aria-hidden="true" /></Link></Button>
        ) : (
          <Button asChild variant="outline" className="justify-self-start"><Link href={rentalRoutes.rental(rentalId)}>{t('back')}</Link></Button>
        )}
      </div>
    )
  }
  return (
    <form action={seal} className="surface flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 md:p-5">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="sessionId" value={sessionId} />
      <p className="max-w-prose min-w-0 flex-[1_1_16rem] text-pretty text-muted-foreground">{missing.length === 0 ? t('ready') : t('missing', { count: missing.length })}</p>
      <Button type="submit" variant={missing.length === 0 ? 'default' : 'outline'} className="min-h-12 max-sm:w-full" disabled={pending || missing.length > 0}><Lock aria-hidden="true" />{t('seal')}</Button>
      <div className="basis-full empty:hidden"><ActionMessage result={result} success="" results="shop.returns.results" /></div>
    </form>
  )
}
