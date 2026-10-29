'use client'

import type { CustomCellRendererProps } from 'ag-grid-react'
import { TriangleAlert } from 'lucide-react'
import { createContext, useContext } from 'react'
import { CheckBox } from '@/components/ui/check-box'
import { SampleTag } from '@/components/ui/sample-tag'
import type { BoardRow } from './board'
import type { RowText } from './use-row-text'

// What every cell needs beyond its row. ag-grid-react draws each cell as a React component inside the grid's own
// tree, so a change here reaches every cell without the grid redrawing a row or losing the keyboard's place.
export type GridState = { readonly text: RowText; readonly selectedIds: ReadonlySet<string> }
export const GridStateContext = createContext<GridState | null>(null)

export function useGridState(): GridState {
  const state = useContext(GridStateContext)
  if (state === null) throw new Error('A decision cell is drawn outside its grid.')
  return state
}

type CellProps = CustomCellRendererProps<BoardRow>

// A release the viewer may approve with others: a real checkbox, 44 pixels square, kept in step with the grid's own
// choice of rows. Space on the row chooses it too.
export function ChooseCell({ data, node }: CellProps) {
  const { text, selectedIds } = useGridState()
  if (data === undefined || !data.selectable) return null
  return <CheckBox label={text.choose(data)} hideLabel checked={selectedIds.has(data.id)} onChange={(on) => { node.setSelected(on, false, 'checkboxSelected') }} />
}

// What is asked, about whom, and who decides.
export function DecisionCell({ data }: CellProps) {
  const { text } = useGridState()
  if (data === undefined) return null
  return (
    <div className="grid h-full min-w-0 content-center gap-0.5 py-2 leading-snug">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{text.title(data)}</span>
        {data.simulated ? <SampleTag /> : null}
      </div>
      <span className="truncate text-sm text-muted-foreground">{text.subject(data)}</span>
      <span className={data.decider === 'you' ? 'truncate text-xs font-semibold' : 'truncate text-xs text-muted-foreground'}>{text.deciderLine(data)}</span>
    </div>
  )
}

// When it falls due, as a date; what is already late says so in a word and a sign, never by colour alone.
export function DueCell({ data }: CellProps) {
  const { text } = useGridState()
  if (data === undefined) return null
  return (
    <div className="grid h-full min-w-0 content-center gap-0.5 text-sm leading-snug">
      <span className="figures truncate">{data.due === null ? text.dueNone() : text.moment(data.due)}</span>
      {data.overdue ? (
        <span className="flex items-center gap-1 font-semibold text-destructive">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {text.overdueWord()}
        </span>
      ) : null}
    </div>
  )
}

export function AmountCell({ data }: CellProps) {
  const { text } = useGridState()
  if (data === undefined) return null
  return <span className="figures flex h-full items-center justify-end">{text.money(data.amountCents)}</span>
}
