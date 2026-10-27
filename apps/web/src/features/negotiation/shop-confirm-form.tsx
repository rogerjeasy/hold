'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { confirmSettlementForShop } from './actions'

// The shop's final tap on what the advocates agreed (extensions.md section 9.9): the owner or a manager confirms, as
// for any decision on a contested claim, or declines and decides it themselves.
export function ShopConfirmForm({ negotiationId, agreed }: { negotiationId: string; agreed: string }) {
  const t = useTranslations('negotiation.confirm')
  const locale = useLocale()
  const [result, decide, pending] = useActionState(confirmSettlementForShop, null)
  return (
    <form action={decide} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="negotiationId" value={negotiationId} />
      <h3 className="text-lg font-semibold">{t('shopTitle')}</h3>
      <p className="text-lg font-semibold">{agreed}</p>
      <p className="text-muted-foreground">{t('shopGuidance')}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="decision" value="confirm" disabled={pending} className="min-h-12 whitespace-normal">{t('confirm')}</Button>
        <Button type="submit" name="decision" value="decline" variant="outline" disabled={pending} className="min-h-12 whitespace-normal">{t('decline')}</Button>
      </div>
      <ActionMessage result={result} success={t('shopDone')} results="negotiation.results" />
    </form>
  )
}
