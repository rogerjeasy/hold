'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import type { DetailHeading } from '@/components/grid/master-detail'
import type { ShopClock } from '@/hooks/use-shop-format'
import type { LedgerGrouping } from './ledger-cells'
import { LedgerCards } from './ledger-cards'
import { LedgerDetail } from './ledger-detail'
import { LedgerGrid } from './ledger-grid'
import { filterCounts, MONEY_FILTERS, visibleRows } from './ledger-rows'
import type { LedgerRentalRow, LedgerRow, MoneyFilter } from './ledger-rows'
import { useLedgerText } from './use-ledger-text'

const GROUPINGS: readonly LedgerGrouping[] = ['rental', 'month']

const chipClass = (pressed: boolean) =>
  pressed
    ? 'inline-flex min-h-11 items-center gap-2 border border-foreground bg-foreground px-3.5 font-semibold text-background'
    : 'inline-flex min-h-11 items-center gap-2 border border-border-strong px-3.5 font-semibold hover:bg-muted'

// The ledger itself: where the money is now, as filters with each one's count; a rental's lines together or a month's;
// then the grid, each line opening in place, or a card per rental on a phone. One choice of rows serves both.
export function MoneyLedger({ rows, rentals, clock }: { rows: readonly LedgerRow[]; rentals: readonly LedgerRentalRow[]; clock: ShopClock }) {
  const t = useTranslations('money')
  const text = useLedgerText(clock)
  const [filter, setFilter] = useState<MoneyFilter>('all')
  const [grouping, setGrouping] = useState<LedgerGrouping>('rental')
  const counts = useMemo(() => filterCounts(rentals), [rentals])
  const visible = useMemo(() => visibleRows(rows, filter), [rows, filter])
  const renderDetail = useCallback((row: LedgerRow, heading: DetailHeading) => <LedgerDetail row={row} text={text} headingRef={heading.ref} />, [text])

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-3">
        <div role="group" aria-label={t('filters')} className="flex flex-wrap gap-2">
          {MONEY_FILTERS.map((each) => (
            <button key={each} type="button" aria-pressed={filter === each} onClick={() => { setFilter(each) }} className={chipClass(filter === each)}>
              {t(`filter.${each}`)} <span className="figures text-sm opacity-80">{counts[each]}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('grouping')} className="hidden flex-wrap gap-2 md:flex">
          {GROUPINGS.map((each) => (
            <button key={each} type="button" aria-pressed={grouping === each} onClick={() => { setGrouping(each) }} className={chipClass(grouping === each)}>
              {t(`groupBy.${each}`)}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="max-w-prose text-muted-foreground">{filter === 'check' ? t('noCheck') : t('noMatch')}</p>
      ) : (
        <>
          <div className="hidden min-w-0 gap-2 md:grid">
            <LedgerGrid rows={visible} text={text} grouping={grouping} renderDetail={renderDetail} />
            <p className="text-sm text-muted-foreground">{t('keys')}</p>
          </div>
          <div className="md:hidden">
            <LedgerCards rows={visible} text={text} />
          </div>
        </>
      )}
    </div>
  )
}
