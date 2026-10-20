'use client'

import type { RentalReturn } from '@hold/db'
import { Camera } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { Link, useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { startReturn } from './actions'

export function ReturnPanel({ rentalId, returns, canAct }: { rentalId: string; returns: readonly RentalReturn[]; canAct: boolean }) {
  const t = useTranslations('shop.returns')
  const locale = useLocale()
  const router = useRouter()
  const [started, start, pending] = useActionState(startReturn, null)
  useEffect(() => { if (started?.ok === true) router.push(rentalRoutes.return(rentalId, started.value.sessionId)) }, [started, rentalId, router])
  return <Panel title={t('title')}><div className="grid gap-3 px-4 py-4 md:px-5"><p className="text-muted-foreground">{t('body')}</p>
    <ul className="grid gap-3">{returns.map((item) => <li key={item.itemId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
      <span className="min-w-0 font-semibold wrap-long-words">{item.label}</span>
      {item.comparisonId !== null ? <Button asChild variant="outline"><Link href={rentalRoutes.comparison(rentalId, item.comparisonId)}>{t('review')}</Link></Button>
        : item.sessionId !== null ? <Button asChild variant="outline"><Link href={rentalRoutes.return(rentalId, item.sessionId)} aria-label={t('continueItem', { item: item.label })}>{item.sealed ? t('sealed') : t('continue')}</Link></Button>
          : canAct ? <form action={start}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={rentalId} /><input type="hidden" name="itemId" value={item.itemId} /><Button type="submit" disabled={pending} aria-label={t('startItem', { item: item.label })}><Camera aria-hidden="true" />{t('start')}</Button></form> : <span>{t('noPhoto')}</span>}
    </li>)}</ul><ActionMessage result={started?.ok === true ? null : started} success="" results="shop.returns.results" />
  </div></Panel>
}
