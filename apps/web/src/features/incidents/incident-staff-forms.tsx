'use client'

import type { ShopIncident } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ActionMessage } from '@/features/shop/action-message'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { ShopClock } from '@/hooks/use-shop-format'
import { confirmPrice, takeOnAsShopMatter } from './actions'

// A staff member confirms which entry of the agreed list applies; the model's suggestion is only the starting choice.
export function ConfirmPriceForm({ incident, clock }: { incident: ShopIncident; clock: ShopClock }) {
  const t = useTranslations('shop.incidents')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const [result, confirm, pending] = useActionState(confirmPrice, null)
  const field = `price-${incident.id}`
  return (
    <form action={confirm} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="incidentId" value={incident.id} />
      <Label htmlFor={field}>{t('priceThatApplies')}</Label>
      <Select id={field} name="priceEntryId" defaultValue={incident.suggestion?.id ?? incident.prices[0]?.id}>
        {incident.prices.map((price) => <option key={price.id} value={price.id}>{price.description} · {format.money(price.amountCents)}</option>)}
      </Select>
      <Button type="submit" disabled={pending} className="min-h-11 justify-self-start whitespace-normal">{t('confirmPrice')}</Button>
      <ActionMessage result={result} success={t('priceConfirmed')} results="shop.incidents.results" />
    </form>
  )
}

export function ShopMatterForm({ incidentId }: { incidentId: string }) {
  const t = useTranslations('shop.incidents')
  const locale = useLocale()
  const [result, take, pending] = useActionState(takeOnAsShopMatter, null)
  return (
    <form action={take} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="incidentId" value={incidentId} />
      <Button type="submit" variant="outline" disabled={pending} className="min-h-11 justify-self-start whitespace-normal">{t('shopMatter')}</Button>
      <ActionMessage result={result} success={t('shopMatterDone')} results="shop.incidents.results" />
    </form>
  )
}
