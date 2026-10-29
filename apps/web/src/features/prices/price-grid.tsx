'use client'

import { PRICE_CATEGORIES } from '@hold/domain'
import type { PriceCategory, PriceCellProblems } from '@hold/domain'
import type { CellClassParams, ColDef, RowDragEndEvent, ValueSetterParams } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import type { EditorRow } from './editor-model'
import { AmountCell, DescriptionCell, PriceGridContext, RemoveCell } from './price-cells'

registerGridModules()

export type PriceGridProps = {
  rows: readonly EditorRow[]
  currency: string
  problems: ReadonlyMap<number, PriceCellProblems>
  onChange: (key: number, change: Partial<Omit<EditorRow, 'key'>>) => void
  onRemove: (key: number) => void
  onMove: (key: number, toIndex: number) => void
  onPaste: (text: string) => void
  onUndo: () => void
  onRedo: () => void
}

const editing = (target: EventTarget) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// The draft as an editable grid: each price a row, in the order renters read them. A cell's edit never changes the row
// in place: it goes to the draft as a new step of the undo history, and the grid is given the new rows.
export function PriceGrid({ rows, currency, problems, onChange, onRemove, onMove, onPaste, onUndo, onRedo }: PriceGridProps) {
  const t = useTranslations('shop.priceEditor')
  const categories = useTranslations('shop.prices.categories')
  const kinds = useMemo(() => Object.fromEntries(PRICE_CATEGORIES.map((category) => [category, categories(category)])) as Record<PriceCategory, string>, [categories])
  const setter = useCallback((field: 'description' | 'category' | 'amount') => (params: ValueSetterParams<EditorRow>) => {
    const value = typeof params.newValue === 'string' ? params.newValue : ''
    if (value !== params.data[field]) onChange(params.data.key, { [field]: field === 'category' ? (PRICE_CATEGORIES.find((each) => each === value) ?? 'damage') : value })
    // The grid keeps nothing itself: the new rows arrive from the draft.
    return false
  }, [onChange])
  const columns = useMemo<ColDef<EditorRow>[]>(() => {
    // A cell with a problem is marked, and says what it is under its value.
    const problemIn = (field: 'description' | 'amount') => ({ 'price-cell-problem': (params: CellClassParams<EditorRow>) => params.data !== undefined && problems.get(params.data.key)?.[field] !== undefined })
    return [
      { colId: 'order', headerName: t('columns.order'), rowDrag: true, width: 84, maxWidth: 84, valueGetter: ({ node }) => (node?.rowIndex ?? 0) + 1, sortable: false },
      { colId: 'description', headerName: t('columns.description'), field: 'description', editable: true, valueSetter: setter('description'), cellRenderer: DescriptionCell, cellClassRules: problemIn('description'), flex: 3, minWidth: 200, sortable: false },
      { colId: 'kind', headerName: t('columns.kind'), field: 'category', editable: true, valueSetter: setter('category'), cellEditor: 'agSelectCellEditor', cellEditorParams: { values: [...PRICE_CATEGORIES] }, refData: kinds, flex: 1, minWidth: 110, sortable: false },
      { colId: 'amount', headerName: t('columns.amount', { currency }), field: 'amount', editable: true, valueSetter: setter('amount'), cellRenderer: AmountCell, cellClassRules: problemIn('amount'), flex: 2, minWidth: 150, type: 'rightAligned', sortable: false },
      { colId: 'remove', headerName: t('columns.remove'), cellRenderer: RemoveCell, width: 92, maxWidth: 92, sortable: false },
    ]
  }, [t, currency, kinds, setter, problems])
  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ currency, problems, onRemove }), [currency, problems, onRemove])
  const onRowDragEnd = useCallback((event: RowDragEndEvent<EditorRow>) => {
    if (event.node.data !== undefined) onMove(event.node.data.key, event.overIndex)
  }, [onMove])
  // A list pasted onto the grid joins the draft; a paste inside a cell being edited stays in the cell.
  const onPasteList = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing(event.target)) return
    event.preventDefault()
    onPaste(event.clipboardData.getData('text/plain'))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing(event.target) || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
    event.preventDefault()
    if (event.shiftKey) onRedo()
    else onUndo()
  }
  return (
    <PriceGridContext.Provider value={state}>
      <div className="hold-grid min-w-0" role="region" aria-label={t('grid.label')} onPaste={onPasteList} onKeyDown={onKeyDown}>
        <AgGridReact<EditorRow>
          theme={holdGridTheme}
          rowData={rowData}
          columnDefs={columns}
          getRowId={({ data }) => String(data.key)}
          rowHeight={56}
          domLayout="autoHeight"
          ensureDomOrder
          suppressMovableColumns
          animateRows={false}
          rowDragManaged
          stopEditingWhenCellsLoseFocus
          singleClickEdit={false}
          onRowDragEnd={onRowDragEnd}
        />
      </div>
    </PriceGridContext.Provider>
  )
}
