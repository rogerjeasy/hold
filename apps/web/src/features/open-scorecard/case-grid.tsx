'use client'

import type { ColDef, GetRowIdParams, GridApi, GridReadyEvent, RowHeightParams } from 'ag-grid-community'
import { ExcelExportModule, MasterDetailModule, RowGroupingModule, SetFilterModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { createMasterDetail, useRowToggle } from '@/components/grid/master-detail'
import { usePopupParent } from '@/components/grid/use-popup-parent'
import type { DetailHeading } from '@/components/grid/master-detail'
import { AlignmentCell, CaseGroupLabel, ClaimCell, OutcomeCell, PairCell, SecondLookCell, VerdictCell } from './case-cells'
import type { CaseRow } from './case-rows'

registerGridModules()

// Grouping by kind, each pair opening in place, filtering by a column's values and the spreadsheet download: AG Grid
// Enterprise.
const MODULES = [RowGroupingModule, MasterDetailModule, SetFilterModule, ExcelExportModule]
const { MasterDetailProvider, OpenRowCell, DetailRowCell } = createMasterDetail<CaseRow>()
const CONTROLS = ['open']
// What a spreadsheet gets: every column with words in it, the group first.
const EXPORTED = ['group', 'pair', 'expected', 'actual', 'model', 'secondLook', 'alignment', 'verdict']

export type CaseGridProps = {
  rows: readonly CaseRow[]
  // Grouped by kind when more than one kind is shown.
  grouped: boolean
  // A pair's photographs and what each look said, drawn under its row when it is opened.
  renderDetail: (row: CaseRow, heading: DetailHeading) => ReactNode
}

// The order the results sort in: what went wrong first.
const VERDICT_ORDER: Readonly<Record<CaseRow['verdict'], number>> = { fail: 0, person: 1, pass: 2 }
const VERDICTS = Object.keys(VERDICT_ORDER) as CaseRow['verdict'][]

// A column's values in words, for the spreadsheet and for the list its filter offers, which needs to be told apart.
// AG Grid gives each formatter the column's value.
function wordsFor<Value>(format: (value: Value) => string): Pick<ColDef<CaseRow, Value>, 'valueFormatter' | 'filterParams'> {
  const valueFormatter = ({ value }: { readonly value: Value | null | undefined }) => (value === null || value === undefined ? '' : format(value))
  return { valueFormatter, filterParams: { valueFormatter } }
}

const idOf = (row: CaseRow) => row.id
const getRowId = ({ data }: GetRowIdParams<CaseRow>) => data.id
const getRowHeight = ({ node }: RowHeightParams<CaseRow>) => (node.group && !node.master ? 52 : undefined)

// Every pair of the accepted run as a row: what it should have ended in, what it did, what the comparison claimed and
// how sure it was, what the second look said, how well the photographs lined up, and whether it was right. Each column
// says its values in words, which its filter lists and the spreadsheet holds.
export function CaseGrid({ rows, grouped, renderDetail }: CaseGridProps) {
  const t = useTranslations('openScorecard')
  const popupParent = usePopupParent()
  const levels = useTranslations('scorecard.levels')
  const [api, setApi] = useState<GridApi<CaseRow> | null>(null)
  const { toggle, focusOnOpen, onCellClicked, onCellKeyDown } = useRowToggle(idOf, CONTROLS)

  const columns = useMemo<ColDef<CaseRow>[]>(() => {
    const setFilter = { filter: 'agSetColumnFilter', suppressHeaderMenuButton: true }
    return [
      { colId: 'group', headerName: t('columns.group'), valueGetter: ({ data }) => data?.group, ...wordsFor((group: CaseRow['group']) => t(`groups.${group}`)), rowGroup: grouped, hide: true },
      { colId: 'open', headerName: t('columns.open'), cellRenderer: OpenRowCell, width: 64, maxWidth: 64, sortable: false, suppressHeaderMenuButton: true },
      { colId: 'pair', headerName: t('columns.pair'), cellRenderer: PairCell, valueGetter: ({ data }) => data?.id ?? '', flex: 2, minWidth: 180 },
      { colId: 'expected', headerName: t('columns.expected'), field: 'expected', cellRenderer: OutcomeCell, ...wordsFor((outcome: CaseRow['expected']) => t(`outcomes.${outcome}`)), ...setFilter, flex: 1, minWidth: 116 },
      { colId: 'actual', headerName: t('columns.actual'), field: 'actual', cellRenderer: OutcomeCell, ...wordsFor((outcome: CaseRow['actual']) => t(`outcomes.${outcome}`)), ...setFilter, flex: 1, minWidth: 116 },
      {
        colId: 'model',
        headerName: t('columns.model'),
        cellRenderer: ClaimCell,
        valueGetter: ({ data }) => data?.lead?.confidence ?? -1,
        valueFormatter: ({ data }) => (data?.lead === null || data?.lead === undefined || data.level === null ? t('noClaim') : t('claimed', { class: t(`classes.${data.lead.class}`), level: levels(data.level) })),
        flex: 2,
        minWidth: 170,
      },
      { colId: 'secondLook', headerName: t('columns.secondLook'), valueGetter: ({ data }) => data?.secondLook, cellRenderer: SecondLookCell, ...wordsFor((answer: CaseRow['secondLook']) => t(`secondLook.${answer}`)), ...setFilter, sortable: false, flex: 1, minWidth: 132 },
      { colId: 'alignment', headerName: t('columns.alignment'), cellRenderer: AlignmentCell, valueGetter: ({ data }) => data?.alignment ?? -1, valueFormatter: ({ data }) => (data?.alignment === null || data?.alignment === undefined ? t('noAlignment') : t('alignment', { percent: Math.round(data.alignment * 100) })), width: 84, minWidth: 84, type: 'rightAligned' },
      {
        colId: 'verdict',
        headerName: t('columns.verdict'),
        cellRenderer: VerdictCell,
        valueGetter: ({ data }) => (data === undefined ? null : VERDICT_ORDER[data.verdict]),
        ...wordsFor((order: number) => t(`verdicts.${VERDICTS.find((verdict) => VERDICT_ORDER[verdict] === order) ?? 'pass'}`)),
        ...setFilter,
        flex: 1,
        minWidth: 192,
      },
    ]
  }, [t, levels, grouped])

  const onGridReady = useCallback((event: GridReadyEvent<CaseRow>) => { setApi(event.api) }, [])
  // The pairs shown, every cell as its column words it, for anyone to check in a spreadsheet of their own.
  const download = () => { api?.exportDataAsExcel({ fileName: 'hold-gate-pairs.xlsx', sheetName: t('sheet'), columnKeys: EXPORTED, skipRowGroups: true, processCellCallback: ({ value, formatValue }) => formatValue(value) }) }

  const rowData = useMemo(() => [...rows], [rows])
  const opening = useMemo(
    () => ({ toggle, focusOnOpen, idOf, nameOf: (row: CaseRow) => t('detail.heading', { id: row.id }), toggleLabel: (row: CaseRow, open: boolean) => t(open ? 'closePair' : 'openPair', { id: row.id }), renderDetail }),
    [toggle, focusOnOpen, t, renderDetail],
  )
  return (
    <MasterDetailProvider value={opening}>
      <div className="grid min-w-0 gap-3">
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={api === null} onClick={download}>
          <Download aria-hidden="true" />
          {t('download')}
        </Button>
        <div className="hold-grid min-w-0" role="region" aria-label={t('grid')}>
          <AgGridReact<CaseRow>
            modules={MODULES}
            theme={holdGridTheme}
            popupParent={popupParent}
            rowData={rowData}
            columnDefs={columns}
            getRowId={getRowId}
            rowHeight={64}
            getRowHeight={getRowHeight}
            domLayout="autoHeight"
            ensureDomOrder
            suppressMovableColumns
            animateRows={false}
            groupDisplayType="groupRows"
            groupRowRendererParams={{ innerRenderer: CaseGroupLabel, suppressCount: true }}
            // Every group open and every pair closed: AG Grid counts a pair as a level below its group.
            groupDefaultExpanded={grouped ? 1 : 0}
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
  )
}
