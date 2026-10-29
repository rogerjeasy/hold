import { Banknote } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { LedgerRentalRow, LedgerRow } from './ledger-rows'
import { MoneyLedger } from './money-ledger'

export type MoneyScreenProps = {
  shopName: string
  clock: ShopClock
  rows: readonly LedgerRow[]
  rentals: readonly LedgerRentalRow[]
}

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="grid min-w-0 gap-1 border bg-card p-4 text-card-foreground">
      <dt className="label text-xs text-muted-foreground">{label}</dt>
      <dd className="figures text-2xl font-semibold wrap-long-words" data-testid={testId}>{value}</dd>
    </div>
  )
}

const sum = (rentals: readonly LedgerRentalRow[], of: (rental: LedgerRentalRow) => number) => rentals.reduce((total, rental) => total + of(rental), 0)

// The money ledger (extensions.md section 12.5): where the shop's money is now, then every line of the money log, as
// PayPal recorded it and Hold read it back, with each rental checked against its hold, its claim and PayPal. Every
// staff member reads it; nothing on it moves money.
export function MoneyScreen({ shopName, clock, rows, rentals }: MoneyScreenProps) {
  const t = useTranslations('money')
  const format = useShopFormat(clock)
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid min-w-0 gap-8">
        <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
        {rows.length === 0 ? (
          <div className="flex max-w-prose gap-3 border bg-card p-5 text-card-foreground">
            <Banknote aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Figure label={t('figures.held')} value={format.money(sum(rentals, (rental) => rental.money.heldNowCents))} testId="money-held" />
              <Figure label={t('figures.toShop')} value={format.money(sum(rentals, (rental) => rental.money.toShopCents))} testId="money-to-shop" />
              <Figure label={t('figures.back')} value={format.money(sum(rentals, (rental) => rental.money.backCents))} testId="money-back" />
            </dl>
            <MoneyLedger rows={rows} rentals={rentals} clock={clock} />
          </>
        )}
      </div>
    </ShopFrame>
  )
}
