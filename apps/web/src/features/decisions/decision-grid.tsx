'use client'

import { CellStyleModule, ClientSideRowModelModule, ModuleRegistry, RowApiModule, RowSelectionModule, ValidationModule } from 'ag-grid-community'
import type { CellClickedEvent, CellFocusedEvent, CellKeyDownEvent, ColDef, GridApi, GridReadyEvent, IRowNode, SelectionChangedEvent } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardRow } from './board'
import { AmountCell, ChooseCell, DecisionCell, DueCell, GridStateContext } from './decision-cells'
import { decisionGridTheme } from './grid-theme'
import type { RowText } from './use-row-text'

// Only what the board uses; the validation module explains a misconfiguration while developing and is left out of a build.
ModuleRegistry.registerModules([ClientSideRowModelModule, RowSelectionModule, RowApiModule, CellStyleModule, ...(process.env.NODE_ENV === 'production' ? [] : [ValidationModule])])

export type DecisionGridProps = {
  rows: readonly BoardRow[]
  text: RowText
  chosenId: string | null
  selectedIds: ReadonlySet<string>
  // A row was moved to, by the keyboard or a click; open: Enter asked for it, so its evidence takes the focus.
  onChoose: (id: string, options?: { readonly open: boolean }) => void
  onSelect: (ids: readonly string[]) => void
}

// Missing dates and amounts sort last, whichever way the column is sorted.
const lastWhenMissing = (first: number | null, second: number | null, _a: unknown, _b: unknown, descending: boolean) => {
  if (first === null || second === null) return first === second ? 0 : (first === null) !== descending ? 1 : -1
  return first - second
}

const isKey = (event: CellKeyDownEvent<BoardRow>, key: string) => event.event instanceof KeyboardEvent && event.event.key === key

// The board as a grid, for a laptop or a tablet: one row per decision, in the order they fall due unless a column is
// sorted. Arrow keys move between decisions and the chosen one is shown beside the grid; Enter opens it there.
export function DecisionGrid({ rows, text, chosenId, selectedIds, onChoose, onSelect }: DecisionGridProps) {
  const t = useTranslations('decisions')
  const [api, setApi] = useState<GridApi<BoardRow> | null>(null)
  const selectable = rows.some((row) => row.selectable)

  const columns = useMemo<ColDef<BoardRow>[]>(() => [
    { colId: 'choose', headerName: t('columns.choose'), cellRenderer: ChooseCell, width: 64, maxWidth: 64, sortable: false, hide: !selectable, suppressHeaderMenuButton: true },
    { colId: 'decision', headerName: t('columns.decision'), cellRenderer: DecisionCell, flex: 3, minWidth: 260, sortable: false },
    { colId: 'due', headerName: t('columns.due'), cellRenderer: DueCell, valueGetter: ({ data }) => data?.due?.getTime() ?? null, comparator: lastWhenMissing, flex: 1, minWidth: 170 },
    { colId: 'amount', headerName: t('columns.amount'), cellRenderer: AmountCell, valueGetter: ({ data }) => data?.amountCents ?? null, comparator: lastWhenMissing, width: 132, minWidth: 116, type: 'rightAligned' },
  ], [t, selectable])

  // The page's choice of releases, also made in the phone's list, kept in step with the grid's own.
  useEffect(() => {
    api?.forEachNode((node: IRowNode<BoardRow>) => {
      const chosen = node.data !== undefined && selectedIds.has(node.data.id)
      if (node.isSelected() !== chosen) node.setSelected(chosen, false, 'api')
    })
  }, [api, selectedIds, rows])

  const onGridReady = useCallback((event: GridReadyEvent<BoardRow>) => { setApi(event.api) }, [])
  const onSelectionChanged = useCallback((event: SelectionChangedEvent<BoardRow>) => {
    if (event.source === 'api') return
    onSelect(event.api.getSelectedRows().map((row) => row.id))
  }, [onSelect])
  const onCellFocused = useCallback((event: CellFocusedEvent<BoardRow>) => {
    if (event.rowIndex === null) return
    const row = event.api.getDisplayedRowAtIndex(event.rowIndex)?.data
    if (row !== undefined && row.id !== chosenId) onChoose(row.id)
  }, [chosenId, onChoose])
  const onCellClicked = useCallback((event: CellClickedEvent<BoardRow>) => {
    if (event.data !== undefined) onChoose(event.data.id)
  }, [onChoose])
  const onCellKeyDown = useCallback((event: CellKeyDownEvent<BoardRow>) => {
    if (event.data !== undefined && isKey(event, 'Enter')) onChoose(event.data.id, { open: true })
  }, [onChoose])

  // A new array only when the rows change, so moving the choice never makes the grid compare its rows again.
  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ text, chosenId, selectedIds }), [text, chosenId, selectedIds])
  return (
    <GridStateContext.Provider value={state}>
      <div className="decision-grid min-w-0" role="region" aria-label={t('grid')}>
        <AgGridReact<BoardRow>
          theme={decisionGridTheme}
          rowData={rowData}
          columnDefs={columns}
          getRowId={({ data }) => data.id}
          domLayout="autoHeight"
          ensureDomOrder
          suppressMovableColumns
          suppressDragLeaveHidesColumns
          animateRows={false}
          rowSelection={{ mode: 'multiRow', checkboxes: false, headerCheckbox: false, enableClickSelection: false, isRowSelectable: (node) => node.data?.selectable === true }}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onCellFocused={onCellFocused}
          onCellKeyDown={onCellKeyDown}
          onCellClicked={onCellClicked}
        />
      </div>
    </GridStateContext.Provider>
  )
}
