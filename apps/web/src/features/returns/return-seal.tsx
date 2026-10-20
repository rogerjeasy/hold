'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { sealReturn } from './actions'

export function ReturnSeal({ rentalId, sessionId, missing, sealed }: { rentalId: string; sessionId: string; missing: readonly string[]; sealed: boolean }) {
  const t = useTranslations('shop.returns')
  const locale = useLocale()
  const [result, seal, pending] = useActionState(sealReturn, null)
  if (sealed || result?.ok === true) return <div className="grid gap-3">
    <p role="status">{t('sealedNote')}</p>
    {result?.ok === true && result.value.comparisonId !== null ? <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={rentalRoutes.comparison(rentalId, result.value.comparisonId)}>{t('review')}</Link> : <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={rentalRoutes.rental(rentalId)}>{t('back')}</Link>}
  </div>
  return <form action={seal} className="grid gap-3">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="sessionId" value={sessionId} />
    <p className="text-muted-foreground">{missing.length === 0 ? t('ready') : t('missing', { count: missing.length })}</p>
    <Button type="submit" className="min-h-12 justify-self-start" disabled={pending || missing.length > 0}>{t('seal')}</Button>
    <ActionMessage result={result} success="" results="shop.returns.results" />
  </form>
}
