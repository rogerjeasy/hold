'use client'

import type { ColDef, GetContextMenuItems, GetRowIdParams, GridApi, GridReadyEvent, IAggFuncParams, IRowNode, RowHeightParams, SelectionChangedEvent } from 'ag-grid-community'
import { ContextMenuModule, MasterDetailModule, RowGroupingModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CONTROL_COLUMN } from '@/components/grid/control-column'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { createMasterDetail, useRowToggle } from '@/components/grid/master-detail'
import { usePopupParent } from '@/components/grid/use-popup-parent'
import type { DetailHeading } from '@/components/grid/master-detail'
import { useRouter } from '@/i18n/navigation'
import { itemRoutes, rentalRoutes } from '@/lib/routes'
import type { BoardRow } from './board'
import { AmountCell, ChooseCell, DecisionCell, DueCell, GridStateContext } from './decision-cells'
import { DecisionGroupLabel } from './decision-group-label'
import type { RowText } from './use-row-text'

registerGridModules()

// Grouping by kind, each decision opening in place, and the right-click menu: AG Grid Enterprise.
const MODULES = [RowGroupingModule, MasterDetailModule, ContextMenuModule]
const { MasterDetailProvider, OpenRowCell, DetailRowCell } = createMasterDetail<BoardRow>()
// The controls on a decision's row that do their own thing when clicked.
const CONTROLS = ['open', 'choose']

export type DecisionGridProps = {
  rows: readonly BoardRow[]
  text: RowText
  // Grouped by kind when more than one kind is shown.
  grouped: boolean
  selectedIds: ReadonlySet<string>
  onSelect: (ids: readonly string[]) => void
  // A decision's evidence and actions, drawn under its row when it is opened; the heading takes the focus when Enter
  // opened it.
  renderDetail: (row: BoardRow, heading: DetailHeading) => ReactNode
}

// Missing dates and amounts sort last, whichever way the column is sorted.
const lastWhenMissing = (first: number | null, second: number | null, _a: unknown, _b: unknown, descending: boolean) => {
  if (first === null || second === null) return first === second ? 0 : (first === null) !== descending ? 1 : -1
  return first - second
}

// A group's total, from the amounts its decisions have; none when no decision in it has one.
function amountTotal({ values }: IAggFuncParams<BoardRow>): number | null {
  const amounts = values.filter((value): value is number => typeof value === 'number')
  return amounts.length === 0 ? null : amounts.reduce((sum, value) => sum + value, 0)
}

const idOf = (row: BoardRow) => row.id
const getRowId = ({ data }: GetRowIdParams<BoardRow>) => data.id
const getRowHeight = ({ node }: RowHeightParams<BoardRow>) => (node.group === true ? 52 : undefined)

// The board as a grid, for a laptop or a tablet: one row per decision, grouped by kind with the group holding the most
// urgent decision first, in the order they fall due within it unless a column is sorted. A click or Enter opens a
// decision under its row, with its evidence and what can be done; arrow keys move between decisions.
export function DecisionGrid({ rows, text, grouped, selectedIds, onSelect, renderDetail }: DecisionGridProps) {
  const t = useTranslations('decisions')
  const popupParent = usePopupParent()
  const router = useRouter()
  const [api, setApi] = useState<GridApi<BoardRow> | null>(null)
  const selectable = rows.some((row) => row.selectable)
  const { toggle, focusOnOpen, onCellClicked, onCellKeyDown } = useRowToggle(idOf, CONTROLS)

  const columns = useMemo<ColDef<BoardRow>[]>(() => [
    { colId: 'group', valueGetter: ({ data }) => data?.group, rowGroup: grouped, hide: true },
    { colId: 'open', headerName: t('columns.open'), cellRenderer: OpenRowCell, ...CONTROL_COLUMN },
    { colId: 'choose', headerName: t('columns.choose'), cellRenderer: ChooseCell, ...CONTROL_COLUMN, hide: !selectable },
    { colId: 'decision', headerName: t('columns.decision'), cellRenderer: DecisionCell, flex: 3, minWidth: 260, sortable: false },
    { colId: 'due', headerName: t('columns.due'), cellRenderer: DueCell, valueGetter: ({ data }) => data?.due?.getTime() ?? null, comparator: lastWhenMissing, flex: 1, minWidth: 170 },
    { colId: 'amount', headerName: t('columns.amount'), cellRenderer: AmountCell, valueGetter: ({ data }) => data?.amountCents ?? null, aggFunc: amountTotal, comparator: lastWhenMissing, width: 132, minWidth: 116, type: 'rightAligned' },
  ], [t, grouped, selectable])

  // The page's choice of releases, also made in the phone's list, kept in step with the grid's own.
  useEffect(() => {
    api?.forEachNode((node: IRowNode<BoardRow>) => {
      if (node.group === true) return
      const chosen = node.data !== undefined && selectedIds.has(node.data.id)
      if (node.isSelected() !== chosen) node.setSelected(chosen, false, 'api')
    })
  }, [api, selectedIds, rows])

  const onGridReady = useCallback((event: GridReadyEvent<BoardRow>) => { setApi(event.api) }, [])
  const onSelectionChanged = useCallback((event: SelectionChangedEvent<BoardRow>) => {
    if (event.source === 'api') return
    onSelect(event.api.getSelectedRows().map((row) => row.id))
  }, [onSelect])
  // Only ways to read a decision: the menu opens it, its claim page or its rental, and offers nothing that moves money.
  const getContextMenuItems = useCallback<GetContextMenuItems<BoardRow>>(({ node }) => {
    const row = node?.data
    if (node === null || row === undefined) return []
    return [
      { name: node.expanded ? t('menu.close') : t('menu.open'), action: () => { toggle(node) } },
      ...((row.kind === 'claim' || row.kind === 'contested' || row.kind === 'escalated') && row.rentalId !== null ? [{ name: t('menu.claim'), action: () => { router.push(rentalRoutes.claim(row.rentalId ?? '')) } }] : []),
      ...(row.rentalId === null ? [] : [{ name: t('menu.rental'), action: () => { router.push(rentalRoutes.rental(row.rentalId ?? '')) } }]),
      ...(row.kind === 'repair' ? [{ name: t('menu.passport'), action: () => { router.push(itemRoutes.item(row.itemId)) } }] : []),
    ]
  }, [t, toggle, router])

  // A new array only when the rows change, so opening a decision never makes the grid compare its rows again.
  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ text, selectedIds }), [text, selectedIds])
  const opening = useMemo(
    () => ({ toggle, focusOnOpen, idOf, nameOf: text.heading, toggleLabel: (row: BoardRow, open: boolean) => t(open ? 'closeEvidence' : 'openEvidence', { title: text.title(row) }), renderDetail }),
    [toggle, focusOnOpen, text, t, renderDetail],
  )
  return (
    <GridStateContext.Provider value={state}>
      <MasterDetailProvider value={opening}>
        <div className="hold-grid min-w-0" role="region" aria-label={t('grid')}>
          <AgGridReact<BoardRow>
            modules={MODULES}
            theme={holdGridTheme}
            popupParent={popupParent}
            rowData={rowData}
            columnDefs={columns}
            getRowId={getRowId}
            // Three lines a decision: what, about whom, and who decides.
            rowHeight={84}
            getRowHeight={getRowHeight}
            domLayout="autoHeight"
            ensureDomOrder
            suppressMovableColumns
            suppressDragLeaveHidesColumns
            animateRows={false}
            groupDisplayType="groupRows"
            groupRowRendererParams={{ innerRenderer: DecisionGroupLabel, suppressCount: true }}
            // Every group open and every decision closed: AG Grid counts a decision as a level below its group.
            groupDefaultExpanded={grouped ? 1 : 0}
            groupMaintainOrder
            suppressAggFuncInHeader
            masterDetail
            isRowMaster={() => true}
            detailCellRenderer={DetailRowCell}
            detailRowAutoHeight
            getContextMenuItems={getContextMenuItems}
            rowSelection={{ mode: 'multiRow', checkboxes: false, headerCheckbox: false, enableClickSelection: false, groupSelects: 'self', isRowSelectable: (node) => node.data?.selectable === true }}
            onGridReady={onGridReady}
            onSelectionChanged={onSelectionChanged}
            onCellKeyDown={onCellKeyDown}
            onCellClicked={onCellClicked}
          />
        </div>
      </MasterDetailProvider>
    </GridStateContext.Provider>
  )
}
