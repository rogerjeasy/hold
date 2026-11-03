import { ArrowDownToLine, ArrowUpFromLine, Banknote, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { LedgerRentalRow, LedgerRow } from './ledger-rows'
import { MoneyLedger } from './money-ledger'

export type MoneyScreenProps = {
  shopName: string
  clock: ShopClock
  rows: readonly LedgerRow[]
  rentals: readonly LedgerRentalRow[]
}

const sum = (rentals: readonly LedgerRentalRow[], of: (rental: LedgerRentalRow) => number) => rentals.reduce((total, rental) => total + of(rental), 0)

// The money ledger (extensions.md section 12.5): where the shop's money is now, then every line of the money log, as
// PayPal recorded it and Hold read it back, with each rental checked against its hold, its claim and PayPal. Every
// staff member reads it; nothing on it moves money.
export function MoneyScreen({ shopName, clock, rows, rentals }: MoneyScreenProps) {
  const t = useTranslations('money')
  const format = useShopFormat(clock)
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      <div className="grid min-w-0 gap-8">
        {rows.length === 0 ? (
          <div className="surface overflow-clip">
            <EmptyState icon={Banknote} title={t('emptyTitle')} body={t('empty')} />
          </div>
        ) : (
          <>
            <dl className="grid stagger grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
              <StatCard icon={Lock} label={t('figures.held')} value={format.money(sum(rentals, (rental) => rental.money.heldNowCents))} testId="money-held" className="col-span-2 sm:col-span-1" />
              <StatCard icon={ArrowDownToLine} label={t('figures.toShop')} value={format.money(sum(rentals, (rental) => rental.money.toShopCents))} testId="money-to-shop" />
              <StatCard icon={ArrowUpFromLine} label={t('figures.back')} value={format.money(sum(rentals, (rental) => rental.money.backCents))} testId="money-back" />
            </dl>
            <MoneyLedger rows={rows} rentals={rentals} clock={clock} />
          </>
        )}
      </div>
    </ShopFrame>
  )
}
