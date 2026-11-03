'use client'

import { CircleCheck, Keyboard, SearchX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import type { DetailHeading } from '@/components/grid/master-detail'
import { ToggleChip } from '@/components/ui/toggle-chip'
import type { ShopClock } from '@/hooks/use-shop-format'
import type { LedgerGrouping } from './ledger-cells'
import { LedgerCards } from './ledger-cards'
import { LedgerDetail } from './ledger-detail'
import { LedgerGrid } from './ledger-grid'
import { filterCounts, MONEY_FILTERS, visibleRows } from './ledger-rows'
import type { LedgerRentalRow, LedgerRow, MoneyFilter } from './ledger-rows'
import { useLedgerText } from './use-ledger-text'

const GROUPINGS: readonly LedgerGrouping[] = ['rental', 'month']

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
            <ToggleChip key={each} pressed={filter === each} onPress={() => { setFilter(each) }} label={t(`filter.${each}`)} count={counts[each]} />
          ))}
        </div>
        <div role="group" aria-label={t('grouping')} className="hidden flex-wrap gap-2 md:flex">
          {GROUPINGS.map((each) => (
            <ToggleChip key={each} pressed={grouping === each} onPress={() => { setGrouping(each) }} label={t(`groupBy.${each}`)} />
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="surface flex animate-fade items-center gap-3 p-4 text-muted-foreground md:px-5">
          {filter === 'check' ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" /> : <SearchX aria-hidden="true" className="size-5 shrink-0" />}
          {filter === 'check' ? t('noCheck') : t('noMatch')}
        </p>
      ) : (
        <>
          <div className="hidden min-w-0 gap-3 md:grid">
            <LedgerGrid rows={visible} text={text} grouping={grouping} renderDetail={renderDetail} />
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Keyboard aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('keys')}
            </p>
          </div>
          <div className="md:hidden">
            <LedgerCards rows={visible} text={text} />
          </div>
        </>
      )}
    </div>
  )
}
