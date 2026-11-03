import type { ShopToday } from '@hold/db'
import { ArrowDownLeft, Lock, PackageOpen, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { StatCard } from '@/components/ui/stat-card'
import type { HoldSummary } from './decisions'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The four numbers an owner looks at first: what is out, what comes back, what is held and what waits on them.
export function TodayFigures({ today, holds, clock }: { today: ShopToday; holds: HoldSummary; clock: ShopClock }) {
  const t = useTranslations('today.figures')
  const format = useShopFormat(clock)
  const titleId = useId()
  const claimsCents = today.claimsWaiting.reduce((sum, claim) => sum + claim.totalCents, 0)
  const toDecide = today.claimsWaiting.length

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        {t('label')}
      </h2>
      <dl className="grid stagger grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard icon={PackageOpen} label={t('out')} value={String(today.itemsOut)} note={t('outNote', { rentals: today.rentalsOut })} />
        <StatCard icon={ArrowDownLeft} label={t('due')} value={String(today.dueBackToday)} note={t('dueNote', { late: today.late.length })} />
        <StatCard icon={Lock} label={t('held')} value={format.money(holds.heldCents)} note={t('heldNote', { count: holds.count })} />
        <StatCard
          icon={Scale}
          label={t('claims')}
          value={String(toDecide)}
          note={toDecide === 0 ? t('claimsNoteNone') : t('claimsNote', { amount: format.money(claimsCents) })}
          urgent={toDecide > 0 ? t('urgent') : undefined}
        />
      </dl>
    </section>
  )
}
