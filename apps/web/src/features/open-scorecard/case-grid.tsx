'use client'

import type { CellFocusedEvent, CellKeyDownEvent, ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'
import { registerGridModules } from '@/components/grid/grid-modules'
import { holdGridTheme } from '@/components/grid/grid-theme'
import { AlignmentCell, ChosenCaseContext, ClaimCell, OutcomeCell, PairCell, SecondLookCell, VerdictCell } from './case-cells'
import type { CaseRow } from './case-rows'

registerGridModules()

export type CaseGridProps = {
  rows: readonly CaseRow[]
  chosenId: string | null
  // A pair was moved to by the keyboard or a click; open: Enter asked for it, so its photographs take the focus.
  onChoose: (id: string, options?: { readonly open: boolean }) => void
}

// The order the results sort in: what went wrong first.
const VERDICT_ORDER: Readonly<Record<CaseRow['verdict'], number>> = { fail: 0, person: 1, pass: 2 }

// Every pair of the accepted run as a row: what it should have ended in, what it did, what the comparison claimed and
// how sure it was, what the second look said, how well the photographs lined up, and whether it was right.
export function CaseGrid({ rows, chosenId, onChoose }: CaseGridProps) {
  const t = useTranslations('openScorecard')
  const columns = useMemo<ColDef<CaseRow>[]>(() => [
    { colId: 'pair', headerName: t('columns.pair'), cellRenderer: PairCell, valueGetter: ({ data }) => data?.id ?? '', flex: 2, minWidth: 180 },
    { colId: 'expected', headerName: t('columns.expected'), field: 'expected', cellRenderer: OutcomeCell, flex: 1, minWidth: 100 },
    { colId: 'actual', headerName: t('columns.actual'), field: 'actual', cellRenderer: OutcomeCell, flex: 1, minWidth: 100 },
    { colId: 'model', headerName: t('columns.model'), cellRenderer: ClaimCell, valueGetter: ({ data }) => data?.lead?.confidence ?? -1, flex: 2, minWidth: 170 },
    { colId: 'secondLook', headerName: t('columns.secondLook'), cellRenderer: SecondLookCell, sortable: false, flex: 1, minWidth: 116 },
    { colId: 'alignment', headerName: t('columns.alignment'), cellRenderer: AlignmentCell, valueGetter: ({ data }) => data?.alignment ?? -1, width: 84, minWidth: 84, type: 'rightAligned' },
    { colId: 'verdict', headerName: t('columns.verdict'), cellRenderer: VerdictCell, valueGetter: ({ data }) => (data === undefined ? 3 : VERDICT_ORDER[data.verdict]), flex: 1, minWidth: 176 },
  ], [t])
  const rowData = useMemo(() => [...rows], [rows])
  const onCellFocused = useCallback((event: CellFocusedEvent<CaseRow>) => {
    if (event.rowIndex === null) return
    const row = event.api.getDisplayedRowAtIndex(event.rowIndex)?.data
    if (row !== undefined && row.id !== chosenId) onChoose(row.id)
  }, [chosenId, onChoose])
  const onCellKeyDown = useCallback((event: CellKeyDownEvent<CaseRow>) => {
    if (event.data !== undefined && event.event instanceof KeyboardEvent && event.event.key === 'Enter') onChoose(event.data.id, { open: true })
  }, [onChoose])
  return (
    <ChosenCaseContext.Provider value={chosenId}>
      <div className="hold-grid min-w-0" role="region" aria-label={t('grid')}>
        <AgGridReact<CaseRow>
          theme={holdGridTheme}
          rowData={rowData}
          columnDefs={columns}
          getRowId={({ data }) => data.id}
          rowHeight={64}
          domLayout="autoHeight"
          ensureDomOrder
          suppressMovableColumns
          animateRows={false}
          onCellFocused={onCellFocused}
          onCellKeyDown={onCellKeyDown}
        />
      </div>
    </ChosenCaseContext.Provider>
  )
}
