'use client'

import type { RentalReturn } from '@hold/db'
import { ArrowRight, Camera, LoaderCircle, ScanSearch } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { Link, useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { startReturn } from './actions'

// Each item's return on the rental's page: started, continued, or, once compared, the way to its comparison.
export function ReturnPanel({ rentalId, returns, canAct }: { rentalId: string; returns: readonly RentalReturn[]; canAct: boolean }) {
  const t = useTranslations('shop.returns')
  const locale = useLocale()
  const router = useRouter()
  const [started, start, pending] = useActionState(startReturn, null)
  useEffect(() => { if (started?.ok === true) router.push(rentalRoutes.return(rentalId, started.value.sessionId)) }, [started, rentalId, router])
  // The page refreshes with the started return before the next page arrives: it says it is opening, never "Continue".
  const opening = started?.ok === true ? started.value.sessionId : null
  return (
    <Panel title={t('title')} icon={ScanSearch}>
      <div className="grid gap-4 px-4 py-5 md:px-5">
        <p className="text-pretty text-muted-foreground">{t('body')}</p>
        <ul className="grid gap-2">
          {returns.map((item) => (
            <li key={item.itemId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-background/60 py-2 pr-2 pl-3.5">
              <span className="min-w-0 font-semibold wrap-long-words">{item.label}</span>
              {opening !== null && item.sessionId === opening ? (
                <p role="status" className="flex min-h-11 items-center gap-2 text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4.5 shrink-0 animate-spin text-primary" />{t('opening')}</p>
              ) : item.comparisonId !== null ? (
                <Button asChild variant="outline"><Link href={rentalRoutes.comparison(rentalId, item.comparisonId)}>{t('review')}<ArrowRight aria-hidden="true" /></Link></Button>
              ) : item.sessionId !== null ? (
                <Button asChild variant="outline"><Link href={rentalRoutes.return(rentalId, item.sessionId)} aria-label={t('continueItem', { item: item.label })}>{item.sealed ? t('sealed') : t('continue')}</Link></Button>
              ) : canAct ? (
                <form action={start}>
                  <input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={rentalId} /><input type="hidden" name="itemId" value={item.itemId} />
                  <Button type="submit" disabled={pending} aria-label={t('startItem', { item: item.label })}><Camera aria-hidden="true" />{t('start')}</Button>
                </form>
              ) : (
                <span className="min-h-11 content-center px-2 text-sm text-muted-foreground">{t('noPhoto')}</span>
              )}
            </li>
          ))}
        </ul>
        <ActionMessage result={started?.ok === true ? null : started} success="" results="shop.returns.results" />
      </div>
    </Panel>
  )
}
