'use client'
import type { ItemRepair } from '@hold/db'
import { Wrench } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { useRouter } from '@/i18n/navigation'
import { itemRoutes } from '@/lib/routes'
import { startRepair } from './actions'

// A repair still to do: where it came from, what it covers and what was claimed, and the way to photograph it.
export function OpenRepairCard({ itemId, repair, clock, canAct, itemInService }: { itemId: string; repair: ItemRepair; clock: ShopClock; canAct: boolean; itemInService: boolean }) {
  const t = useTranslations('repairs')
  const locale = useLocale()
  const router = useRouter()
  const format = useShopFormat(clock)
  const [result, start, starting] = useActionState(startRepair, null)
  useEffect(() => {
    if (result?.ok === true) router.push(itemRoutes.repair(itemId, repair.id))
  }, [result, router, itemId, repair.id])
  const date = format.day(repair.createdAt)
  const origin = repair.claimId === null ? t('openedBy', { name: repair.opener ?? t('staff'), date }) : repair.renterName === null ? t('fromClaimUnnamed', { date }) : t('fromClaim', { renter: repair.renterName, date })
  const marked = repair.lines.some((line) => line.markId !== null)
  return (
    <Panel title={t('toDoTitle')} icon={Wrench}>
      <div className="grid gap-4 px-4 py-5 md:px-5">
        <p className="text-pretty">{origin}</p>
        <ul className="grid gap-2">
          {repair.lines.map((line) => (
            <li key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-xl border border-border/70 bg-background/60 px-3.5 py-2.5">
              <span className="font-semibold wrap-long-words">{line.description}</span>
              {line.claimedCents === null ? null : <span className="figures text-sm text-muted-foreground">{t('claimed', { amount: format.money(line.claimedCents) })}</span>}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground text-pretty">{itemInService ? t('stillRentable') : t('outOfService')}</p>
        {canAct ? (
          <form action={start} className="grid gap-2">
            <input type="hidden" name="repairId" value={repair.id} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" disabled={starting} className="justify-self-stretch sm:justify-self-start">{marked ? t('photograph') : t('close')}</Button>
            <ActionMessage result={result?.ok === true ? null : result} success="" results="repairs.results" />
          </form>
        ) : null}
        {canAct && itemInService ? <a href="#status" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{t('takeOut')}</a> : null}
      </div>
    </Panel>
  )
}
