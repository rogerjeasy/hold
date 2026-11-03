'use client'

import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, IAggFuncParams, RowHeightParams } from 'ag-grid-community'
import { ExcelExportModule, MasterDetailModule, RowGroupingModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { CONTROL_COLUMN } from '@/components/grid/control-column'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { createMasterDetail, useRowToggle } from '@/components/grid/master-detail'
import type { DetailHeading } from '@/components/grid/master-detail'
import { usePopupParent } from '@/components/grid/use-popup-parent'
import { LedgerGridContext, LedgerGroupLabel, MoneyCell, ReferenceCell, WhatCell, WhenCell } from './ledger-cells'
import type { LedgerGrouping } from './ledger-cells'
import type { LedgerRow } from './ledger-rows'
import type { LedgerText } from './use-ledger-text'

registerGridModules()

// Grouping with the grid's own totals, each line opening in place and the spreadsheet download: AG Grid Enterprise.
const MODULES = [RowGroupingModule, MasterDetailModule, ExcelExportModule]
const { MasterDetailProvider, OpenRowCell, DetailRowCell } = createMasterDetail<LedgerRow>()
const CONTROLS = ['open']
// What a spreadsheet gets: the month and the rental of every line, what it did and where its money went.
const EXPORTED = ['month', 'renter', 'when', 'what', 'amount', 'toShop', 'back', 'reference']

export type LedgerGridProps = {
  rows: readonly LedgerRow[]
  text: LedgerText
  grouping: LedgerGrouping
  // What confirms a line, drawn under it when it is opened.
  renderDetail: (row: LedgerRow, heading: DetailHeading) => ReactNode
}

// A group's total, from the lines in it that moved money that way; none when none did.
function total({ values }: IAggFuncParams<LedgerRow>): number | null {
  const amounts = values.filter((value): value is number => typeof value === 'number')
  return amounts.length === 0 ? null : amounts.reduce((sum, value) => sum + value, 0)
}

const idOf = (row: LedgerRow) => row.id
const getRowId = ({ data }: GetRowIdParams<LedgerRow>) => data.id

// The money log as a grid, for a laptop or a tablet: a rental's lines together, or a month's, the grid adding up
// what went to the shop and back to renters in each. A click or Enter opens a line into what confirmed it.
export function LedgerGrid({ rows, text, grouping, renderDetail }: LedgerGridProps) {
  const t = useTranslations('money')
  const popupParent = usePopupParent()
  const [api, setApi] = useState<GridApi<LedgerRow> | null>(null)
  const { toggle, focusOnOpen, onCellClicked, onCellKeyDown } = useRowToggle(idOf, CONTROLS)

  const columns = useMemo<ColDef<LedgerRow>[]>(() => [
    { colId: 'rental', valueGetter: ({ data }) => data?.rentalId, rowGroup: grouping === 'rental', hide: true },
    { colId: 'month', headerName: t('columns.month'), valueGetter: ({ data }) => data?.month, valueFormatter: ({ value }: { value: string | null | undefined }) => (typeof value === 'string' ? text.month(value) : ''), rowGroup: grouping === 'month', hide: true },
    { colId: 'renter', headerName: t('columns.renter'), valueGetter: ({ data }) => (data === undefined ? '' : text.renter(data.rental)), hide: true },
    { colId: 'open', headerName: t('columns.open'), cellRenderer: OpenRowCell, ...CONTROL_COLUMN },
    { colId: 'when', headerName: t('columns.when'), cellRenderer: WhenCell, valueGetter: ({ data }) => data?.occurredAt.getTime(), valueFormatter: ({ data }) => (data === undefined ? '' : text.moment(data.occurredAt)), width: 168, minWidth: 160 },
    { colId: 'what', headerName: t('columns.what'), cellRenderer: WhatCell, valueGetter: ({ data }) => (data === undefined ? '' : text.what(data)), flex: 2, minWidth: 180, sortable: false },
    { colId: 'amount', headerName: t('columns.amount'), cellRenderer: MoneyCell, valueGetter: ({ data }) => data?.amountCents ?? null, valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? text.money(value) : ''), width: 116, minWidth: 108, type: 'rightAligned' },
    { colId: 'toShop', headerName: t('columns.toShop'), cellRenderer: MoneyCell, valueGetter: ({ data }) => (data?.flow === 'to_shop' ? data.amountCents : null), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? text.money(value) : ''), aggFunc: total, width: 124, minWidth: 116, type: 'rightAligned' },
    { colId: 'back', headerName: t('columns.back'), cellRenderer: MoneyCell, valueGetter: ({ data }) => (data?.flow === 'to_renter' ? data.amountCents : null), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? text.money(value) : ''), aggFunc: total, width: 156, minWidth: 148, type: 'rightAligned' },
    { colId: 'reference', headerName: t('columns.reference'), cellRenderer: ReferenceCell, valueGetter: ({ data }) => data?.paypalReference ?? '', flex: 1, minWidth: 120, sortable: false },
  ], [t, text, grouping])

  const getRowHeight = useCallback(({ node }: RowHeightParams<LedgerRow>) => (node.group && !node.master ? (grouping === 'rental' ? 68 : 52) : undefined), [grouping])
  const onGridReady = useCallback((event: GridReadyEvent<LedgerRow>) => { setApi(event.api) }, [])
  // The lines shown, every cell as the grid words it, for the shop's accountant.
  const download = useCallback(() => {
    api?.exportDataAsExcel({ fileName: 'hold-money-log.xlsx', sheetName: t('sheet'), columnKeys: EXPORTED, skipRowGroups: true, processCellCallback: ({ value, formatValue }) => formatValue(value) })
  }, [api, t])

  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ text, grouping }), [text, grouping])
  const opening = useMemo(
    () => ({ toggle, focusOnOpen, idOf, nameOf: text.lineName, toggleLabel: (row: LedgerRow, open: boolean) => t(open ? 'closeLine' : 'openLine', { line: text.lineName(row) }), renderDetail }),
    [toggle, focusOnOpen, text, t, renderDetail],
  )
  return (
    <LedgerGridContext.Provider value={state}>
      <MasterDetailProvider value={opening}>
        <div className="grid min-w-0 gap-3">
          <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={api === null} onClick={download}>
            <Download aria-hidden="true" />
            {t('download')}
          </Button>
          <div className="hold-grid min-w-0" role="region" aria-label={t('grid')}>
            <AgGridReact<LedgerRow>
              modules={MODULES}
              theme={holdGridTheme}
              popupParent={popupParent}
              rowData={rowData}
              columnDefs={columns}
              getRowId={getRowId}
              rowHeight={60}
              getRowHeight={getRowHeight}
              domLayout="autoHeight"
              ensureDomOrder
              suppressMovableColumns
              suppressAggFuncInHeader
              animateRows={false}
              groupDisplayType="groupRows"
              groupRowRendererParams={{ innerRenderer: LedgerGroupLabel, suppressCount: true }}
              // Every group open and every line closed: AG Grid counts a line as a level below its group.
              groupDefaultExpanded={1}
              groupMaintainOrder
              masterDetail
              isRowMaster={() => true}
              detailCellRenderer={DetailRowCell}
              detailRowAutoHeight
              onGridReady={onGridReady}
              onCellClicked={onCellClicked}
              onCellKeyDown={onCellKeyDown}
            />
          </div>
        </div>
      </MasterDetailProvider>
    </LedgerGridContext.Provider>
  )
}
