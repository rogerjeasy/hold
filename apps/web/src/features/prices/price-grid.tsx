'use client'

import { PRICE_CATEGORIES } from '@hold/domain'
import type { PriceCategory, PriceCellProblems } from '@hold/domain'
import type { CellClassParams, ColDef, GetContextMenuItems, GridApi, GridReadyEvent, ProcessCellForExportParams, ProcessDataFromClipboardParams, RowDragEndEvent, ValueSetterParams } from 'ag-grid-community'
import { CellSelectionModule, ClipboardModule, ContextMenuModule, ExcelExportModule, RichSelectModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { usePopupParent } from '@/components/grid/use-popup-parent'
import type { EditorRow, PasteTarget } from './editor-model'
import { AmountCell, DescriptionCell, PriceGridContext, RemoveCell } from './price-cells'

registerGridModules()

// The grid sits inside the editor's card, which draws the edge.
const PRICE_THEME = holdGridTheme.withParams({ wrapperBorder: false })

// Choosing cells, copying and pasting them, choosing a kind from a list, the right-click menu and the spreadsheet
// download: AG Grid Enterprise.
const MODULES = [CellSelectionModule, ClipboardModule, RichSelectModule, ContextMenuModule, ExcelExportModule]
const PASTE_COLUMNS: Readonly<Record<string, PasteTarget['column']>> = { description: 'description', kind: 'kind', amount: 'amount' }
const EXPORTED = ['description', 'kind', 'amount']

export type PriceGridProps = {
  rows: readonly EditorRow[]
  currency: string
  problems: ReadonlyMap<number, PriceCellProblems>
  onChange: (key: number, change: Partial<Omit<EditorRow, 'key'>>) => void
  onRemove: (key: number) => void
  onMove: (key: number, toIndex: number) => void
  onInsert: (atIndex: number) => void
  // A block of cells pasted at the focused cell, from a spreadsheet or from the grid itself.
  onPasteCells: (target: PasteTarget, cells: readonly (readonly string[])[]) => void
  onUndo: () => void
  onRedo: () => void
}

const editing = (target: EventTarget) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// The draft as an editable grid, like a spreadsheet: each price a row, in the order renters read them, cells chosen by
// dragging or Shift with the arrows, copied out and pasted in. Neither an edit nor a paste changes a row in place: each
// goes to the draft as one step of the undo history, and the grid is given the new rows.
export function PriceGrid({ rows, currency, problems, onChange, onRemove, onMove, onInsert, onPasteCells, onUndo, onRedo }: PriceGridProps) {
  const t = useTranslations('shop.priceEditor')
  const popupParent = usePopupParent()
  const categories = useTranslations('shop.prices.categories')
  const kinds = useMemo(() => Object.fromEntries(PRICE_CATEGORIES.map((category) => [category, categories(category)])) as Record<PriceCategory, string>, [categories])
  const [api, setApi] = useState<GridApi<EditorRow> | null>(null)
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
      { colId: 'kind', headerName: t('columns.kind'), field: 'category', editable: true, valueSetter: setter('category'), cellEditor: 'agRichSelectCellEditor', cellEditorParams: { values: [...PRICE_CATEGORIES], allowTyping: true, filterList: true, highlightMatch: true }, refData: kinds, flex: 1, minWidth: 140, sortable: false },
      { colId: 'amount', headerName: t('columns.amount', { currency }), field: 'amount', editable: true, valueSetter: setter('amount'), cellRenderer: AmountCell, cellClassRules: problemIn('amount'), flex: 2, minWidth: 150, type: 'rightAligned', sortable: false },
      { colId: 'remove', headerName: t('columns.remove'), cellRenderer: RemoveCell, width: 92, maxWidth: 92, sortable: false },
    ]
  }, [t, currency, kinds, setter, problems])
  const rowData = useMemo(() => [...rows], [rows])
  const state = useMemo(() => ({ currency, problems, onRemove }), [currency, problems, onRemove])
  const onRowDragEnd = useCallback((event: RowDragEndEvent<EditorRow>) => {
    if (event.node.data !== undefined) onMove(event.node.data.key, event.overIndex)
  }, [onMove])
  const onGridReady = useCallback((event: GridReadyEvent<EditorRow>) => { setApi(event.api) }, [])
  // A paste onto the grid is the draft's to make, as one change read by Hold's own rules, never the grid's cell by cell.
  const processDataFromClipboard = useCallback(({ api: grid, data }: ProcessDataFromClipboardParams<EditorRow>) => {
    const focused = grid.getFocusedCell()
    if (focused !== null) onPasteCells({ rowIndex: focused.rowIndex, column: PASTE_COLUMNS[focused.column.getColId()] ?? 'description' }, data)
    return null
  }, [onPasteCells])
  // What is copied reads as it does on screen, a kind by its name, so it pastes back into the grid or a spreadsheet.
  const processCellForClipboard = useCallback(({ value, formatValue }: ProcessCellForExportParams<EditorRow>) => formatValue(value), [])
  // The draft as it stands, as the grid words it, for the shop's own records.
  const download = useCallback(() => {
    api?.exportDataAsExcel({ fileName: 'hold-price-list-draft.xlsx', sheetName: t('sheet'), columnKeys: EXPORTED, processCellCallback: ({ value, formatValue }) => formatValue(value) })
  }, [api, t])
  const getContextMenuItems = useCallback<GetContextMenuItems<EditorRow>>(({ node }) => {
    const row = node?.data
    if (node === null || row === undefined) return ['copy']
    const index = node.rowIndex ?? 0
    return [
      { name: t('menu.above'), action: () => { onInsert(index) } },
      { name: t('menu.below'), action: () => { onInsert(index + 1) } },
      { name: t('menu.remove'), action: () => { onRemove(row.key) } },
      'separator',
      'copy',
      'separator',
      { name: t('download'), action: download },
    ]
  }, [t, onInsert, onRemove, download])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing(event.target) || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
    event.preventDefault()
    if (event.shiftKey) onRedo()
    else onUndo()
  }
  return (
    <PriceGridContext.Provider value={state}>
      <div className="grid min-w-0">
        <div className="flex justify-end border-b border-border/70 px-3 py-1.5">
          <Button type="button" variant="ghost" disabled={api === null} onClick={download}>
            <Download aria-hidden="true" />
            {t('download')}
          </Button>
        </div>
        <div className="hold-grid min-w-0" role="region" aria-label={t('grid.label')} onKeyDown={onKeyDown}>
          <AgGridReact<EditorRow>
            modules={MODULES}
            theme={PRICE_THEME}
            popupParent={popupParent}
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
            cellSelection
            processDataFromClipboard={processDataFromClipboard}
            processCellForClipboard={processCellForClipboard}
            getContextMenuItems={getContextMenuItems}
            onGridReady={onGridReady}
            onRowDragEnd={onRowDragEnd}
          />
        </div>
      </div>
    </PriceGridContext.Provider>
  )
}
