'use client'

import type { CellKeyDownEvent, ColDef, GetContextMenuItems, GetRowIdParams, GridApi, GridReadyEvent, IAggFuncParams } from 'ag-grid-community'
import { AgChartsCommunityModule } from 'ag-charts-community'
import { ContextMenuModule, ExcelExportModule, SparklinesModule, TreeDataModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { usePopupParent } from '@/components/grid/use-popup-parent'
import { useTokenColour } from '@/components/grid/use-token-colour'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { useRouter } from '@/i18n/navigation'
import { itemRoutes } from '@/lib/routes'
import { FleetCountCell, FleetGridContext, FleetNameCell, FleetRecoveredCell, FleetStandingCell } from './fleet-cells'
import type { FleetRow } from './fleet-rows'

registerGridModules()

// Types above their items, the types' totals, the line of damage findings, the right-click menu and the spreadsheet
// download: AG Grid Enterprise, with AG Charts drawing the lines.
const MODULES = [TreeDataModule, SparklinesModule.with(AgChartsCommunityModule), ContextMenuModule, ExcelExportModule]
// The grid sits inside its card, which draws the edge.
const FLEET_THEME = holdGridTheme.withParams({ wrapperBorder: false })
const EXPORTED =['type', 'name', 'standing', 'rentals', 'daysOut', 'damage', 'incurred', 'recovered', 'repairCost', 'repairMargin', 'openRepairs', 'marks', 'signal']

// A type's total, from its items that have the figure.
function total({ values }: IAggFuncParams<FleetRow>): number | null {
  const counted = values.filter((value): value is number => typeof value === 'number')
  return counted.length === 0 ? null : counted.reduce((sum, value) => sum + value, 0)
}

const itemFigure = (of: (row: Extract<FleetRow, { kind: 'item' }>) => number) => ({ data }: { data: FleetRow | undefined }) => (data?.kind === 'item' ? of(data) : null)
const getRowId = ({ data }: GetRowIdParams<FleetRow>) => data.id
const getDataPath = (row: FleetRow) => [...row.path]

export type FleetGridProps = { rows: readonly FleetRow[]; clock: ShopClock; canManage: boolean }

// The fleet as a tree, for a laptop or a tablet: each type with its items below it, what their rentals say about each
// item this year, and the item in each type wearing fastest. Enter on an item opens its passport.
export function FleetGrid({ rows, clock, canManage }: FleetGridProps) {
  const t = useTranslations('shop.items.fleet')
  const items = useTranslations('shop.items')
  const format = useShopFormat(clock)
  const router = useRouter()
  const popupParent = usePopupParent()
  const accent = useTokenColour('--primary', 'transparent')
  const [api, setApi] = useState<GridApi<FleetRow> | null>(null)

  const columns = useMemo<ColDef<FleetRow>[]>(() => [
    { colId: 'type', headerName: t('columns.type'), valueGetter: ({ data }) => data?.type.name, hide: true },
    { colId: 'name', headerName: t('columns.item'), valueGetter: ({ data }) => (data?.kind === 'item' ? data.item.label : ''), hide: true },
    // The signal shows beside the item's name, and has a column of its own in the spreadsheet.
    { colId: 'signal', headerName: t('columns.signal'), valueGetter: ({ data }) => (data?.kind === 'item' && data.fastest ? t('fastest') : ''), hide: true },
    { colId: 'standing', headerName: t('columns.standing'), cellRenderer: FleetStandingCell, valueGetter: ({ data }) => (data?.kind === 'item' ? items(`standing.${data.item.standing}`) : ''), width: 156, minWidth: 148, sortable: false },
    { colId: 'rentals', headerName: t('columns.rentals'), cellRenderer: FleetCountCell, valueGetter: itemFigure((row) => row.wear.rentals), aggFunc: total, width: 100, minWidth: 96, type: 'rightAligned' },
    { colId: 'daysOut', headerName: t('columns.daysOut'), cellRenderer: FleetCountCell, valueGetter: itemFigure((row) => row.wear.daysOut), aggFunc: total, width: 108, minWidth: 104, type: 'rightAligned' },
    {
      colId: 'findings',
      headerName: t('columns.findings'),
      valueGetter: ({ data }) => (data?.kind === 'item' && data.wear.findingsByRental.length > 0 ? [...data.wear.findingsByRental] : null),
      cellRenderer: 'agSparklineCellRenderer',
      cellRendererParams: { sparklineOptions: { type: 'bar', direction: 'vertical', fill: accent, stroke: accent, padding: { top: 6, bottom: 6 } } },
      width: 120,
      minWidth: 112,
      sortable: false,
    },
    { colId: 'damage', headerName: t('columns.damage'), valueGetter: itemFigure((row) => row.wear.damageFindings), aggFunc: total, hide: true },
    // Priced and recovered are read together on screen, and kept apart for the spreadsheet.
    { colId: 'incurred', headerName: t('columns.incurred'), valueGetter: itemFigure((row) => row.wear.incurredCents), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? format.money(value) : ''), aggFunc: total, hide: true },
    { colId: 'recovered', headerName: t('columns.recovered'), cellRenderer: FleetRecoveredCell, valueGetter: itemFigure((row) => row.wear.recoveredCents), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? format.money(value) : ''), aggFunc: total, width: 176, minWidth: 168, type: 'rightAligned' },
    // What repairs cost against what the damage recovered (architecture.md section 9.6): above nothing, the price list
    // paid for the repairs; below, it did not.
    { colId: 'repairCost', headerName: t('columns.repairCost'), valueGetter: ({ data }) => (data?.kind === 'item' ? data.repairCostCents : null), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? format.money(value) : '—'), aggFunc: total, width: 140, minWidth: 128, type: 'rightAligned' },
    { colId: 'repairMargin', headerName: t('columns.repairMargin'), valueGetter: ({ data }) => (data?.kind === 'item' ? data.repairMarginCents : null), valueFormatter: ({ value }: { value: number | null | undefined }) => (typeof value === 'number' ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${format.money(Math.abs(value))}` : '—'), cellClassRules: { 'text-success': ({ value }: { value: unknown }) => typeof value === 'number' && value > 0, 'text-destructive': ({ value }: { value: unknown }) => typeof value === 'number' && value < 0 }, aggFunc: total, width: 176, minWidth: 160, type: 'rightAligned' },
    { colId: 'openRepairs', headerName: t('columns.openRepairs'), cellRenderer: FleetCountCell, valueGetter: itemFigure((row) => row.openRepairs), aggFunc: total, width: 128, minWidth: 120, type: 'rightAligned' },
    { colId: 'marks', headerName: t('columns.marks'), cellRenderer: FleetCountCell, valueGetter: itemFigure((row) => row.openMarks), aggFunc: total, width: 112, minWidth: 104, type: 'rightAligned' },
  ], [t, items, format, accent])

  const autoGroupColumnDef = useMemo<ColDef<FleetRow>>(() => ({ headerName: t('columns.item'), minWidth: 260, flex: 2, cellRendererParams: { innerRenderer: FleetNameCell, suppressCount: true } }), [t])
  const onGridReady = useCallback((event: GridReadyEvent<FleetRow>) => { setApi(event.api) }, [])
  const onCellKeyDown = useCallback((event: CellKeyDownEvent<FleetRow>) => {
    if (event.data?.kind === 'item' && event.event instanceof KeyboardEvent && event.event.key === 'Enter') router.push(itemRoutes.item(event.data.item.id))
  }, [router])
  // Only ways to read or change an item through its own page: the passport, its status, and its type's hold.
  const getContextMenuItems = useCallback<GetContextMenuItems<FleetRow>>(({ node }) => {
    const row = node?.data
    if (row === undefined) return []
    const changeable = canManage && !row.type.simulated
    const hold = changeable ? [{ name: t('menu.hold', { name: row.type.name }), action: () => { router.push(`${itemRoutes.type(row.type.id)}#hold`) } }] : []
    if (row.kind === 'type') return [{ name: t('menu.type'), action: () => { router.push(itemRoutes.type(row.type.id)) } }, ...hold]
    return [
      { name: t('menu.passport'), action: () => { router.push(itemRoutes.item(row.item.id)) } },
      { name: t('menu.status'), action: () => { router.push(`${itemRoutes.item(row.item.id)}#status`) } },
      ...hold,
    ]
  }, [canManage, t, router])
  const download = useCallback(() => {
    api?.exportDataAsExcel({ fileName: 'hold-fleet.xlsx', sheetName: t('sheet'), columnKeys: EXPORTED, skipRowGroups: true, processCellCallback: ({ value, formatValue }) => formatValue(value) })
  }, [api, t])

  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ money: format.money }), [format])
  return (
    <FleetGridContext.Provider value={state}>
      <div className="surface min-w-0 overflow-clip">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3 md:px-5">
          <p className="label text-xs text-muted-foreground">{t('grid')}</p>
          <Button type="button" variant="outline" disabled={api === null} onClick={download}>
            <Download aria-hidden="true" />
            {t('download')}
          </Button>
        </div>
        <div className="hold-grid min-w-0" role="region" aria-label={t('grid')}>
          <AgGridReact<FleetRow>
            modules={MODULES}
            theme={FLEET_THEME}
            popupParent={popupParent}
            rowData={rowData}
            columnDefs={columns}
            autoGroupColumnDef={autoGroupColumnDef}
            treeData
            getDataPath={getDataPath}
            getRowId={getRowId}
            groupDefaultExpanded={-1}
            suppressAggFuncInHeader
            // Room for an item's name, and its signal under it where they do not fit side by side.
            rowHeight={68}
            domLayout="autoHeight"
            ensureDomOrder
            suppressMovableColumns
            // Ten columns at most: every cell is drawn, so a column scrolled out of sight is still read by a screen reader.
            suppressColumnVirtualisation
            animateRows={false}
            getContextMenuItems={getContextMenuItems}
            onGridReady={onGridReady}
            onCellKeyDown={onCellKeyDown}
          />
        </div>
        <p className="border-t border-border/70 px-4 py-3 text-sm text-muted-foreground md:px-5">{t('keys')}</p>
      </div>
    </FleetGridContext.Provider>
  )
}
