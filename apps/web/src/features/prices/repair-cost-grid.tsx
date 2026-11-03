'use client'

import type { ColDef, GetRowIdParams } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import type { RepairCostRow } from './repair-cost-rows'

registerGridModules()

// The grid sits inside its card, which draws the edge.
const THEME = holdGridTheme.withParams({ wrapperBorder: false })
const getRowId = ({ data }: GetRowIdParams<RepairCostRow>) => data.id
const ROW_HEIGHT = 52
const HEADER_HEIGHT = 48

// Each costed price, sortable by how far it sits above or below what its repairs cost.
export function RepairCostGrid({ rows, currency }: { rows: readonly RepairCostRow[]; currency: string }) {
  const t = useTranslations('shop.prices.repairs')
  const locale = useLocale()
  const columns = useMemo<ColDef<RepairCostRow>[]>(() => {
    const amount = ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? formatMoney(money(value, currency), locale) : '')
    return [
      { colId: 'description', headerName: t('columns.price'), field: 'description', flex: 2, minWidth: 220 },
      { colId: 'priceCents', headerName: t('columns.amount'), field: 'priceCents', valueFormatter: amount, width: 120, type: 'rightAligned' },
      { colId: 'repairs', headerName: t('columns.repairs'), field: 'repairs', width: 110, type: 'rightAligned' },
      { colId: 'averageCents', headerName: t('columns.average'), field: 'averageCents', valueFormatter: amount, width: 150, type: 'rightAligned' },
      { colId: 'gapCents', headerName: t('columns.gap'), field: 'gapCents', valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(money(Math.abs(value), currency), locale)}` : ''), cellClassRules: { 'text-success': ({ value }: { value: unknown }) => typeof value === 'number' && value >= 0, 'text-destructive': ({ value }: { value: unknown }) => typeof value === 'number' && value < 0 }, width: 180, minWidth: 170, type: 'rightAligned', sort: 'asc' },
      { colId: 'standing', headerName: t('columns.standing'), valueGetter: ({ data }) => (data === undefined ? '' : t(data.standing)), flex: 1, minWidth: 170 },
    ]
  }, [t, currency, locale])
  const rowData = useMemo(() => [...rows], [rows])
  return (
    // Sized to its rows: a short list leaves no empty space below it.
    <div className="hold-grid min-w-0" role="region" aria-label={t('title')} style={{ height: HEADER_HEIGHT + rows.length * ROW_HEIGHT + 2 }}>
      <AgGridReact<RepairCostRow> theme={THEME} rowData={rowData} columnDefs={columns} getRowId={getRowId} rowHeight={ROW_HEIGHT} headerHeight={HEADER_HEIGHT} ensureDomOrder suppressMovableColumns animateRows={false} />
    </div>
  )
}
