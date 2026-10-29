'use client'

import type { CellClickedEvent, CellKeyDownEvent, IRowNode } from 'ag-grid-community'
import type { CustomCellRendererProps } from 'ag-grid-react'
import { ChevronRight } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode, Ref, RefObject } from 'react'

// A row that opens in place under itself, through AG Grid Enterprise's master-detail: a button to open and close it,
// the opened row as one cell across the grid, and a click or Enter on the row doing the same as the button. Opened by
// Enter, the opened row's heading takes the focus, so a screen reader starts reading there. The decision board and the
// open scorecard both open their rows this way.

export type DetailHeading = { readonly ref: Ref<HTMLHeadingElement> }

type Toggle<Row> = (node: IRowNode<Row>, options?: { readonly focus: boolean }) => void

export type MasterDetail<Row> = {
  readonly toggle: Toggle<Row>
  readonly focusOnOpen: RefObject<string | null>
  readonly idOf: (row: Row) => string
  // Names the opened row's region, and says what the button does for a row.
  readonly nameOf: (row: Row) => string
  readonly toggleLabel: (row: Row, open: boolean) => string
  readonly renderDetail: (row: Row, heading: DetailHeading) => ReactNode
}

// Opening and closing rows, and the grid's click and key handlers that do it. A click on one of the row's own controls,
// named by their columns, is left to the control.
export function useRowToggle<Row>(idOf: (row: Row) => string, controls: readonly string[]) {
  const focusOnOpen = useRef<string | null>(null)
  const toggle = useCallback<Toggle<Row>>((node, options) => {
    if (node.data === undefined) return
    focusOnOpen.current = options?.focus === true && !node.expanded ? idOf(node.data) : null
    node.setExpanded(!node.expanded)
  }, [idOf])
  const onCellClicked = useCallback((event: CellClickedEvent<Row>) => {
    if (event.node.group && !event.node.master) return
    if (controls.includes(event.column.getColId())) return
    toggle(event.node)
  }, [toggle, controls])
  const onCellKeyDown = useCallback((event: CellKeyDownEvent<Row>) => {
    if (event.node.master && event.event instanceof KeyboardEvent && event.event.key === 'Enter') toggle(event.node, { focus: true })
  }, [toggle])
  return { toggle, focusOnOpen, onCellClicked, onCellKeyDown }
}

// The context, button and opened row for one kind of row. Made once per grid at the top of its module.
export function createMasterDetail<Row>() {
  const Context = createContext<MasterDetail<Row> | null>(null)
  function useMasterDetail(): MasterDetail<Row> {
    const state = useContext(Context)
    if (state === null) throw new Error('A row that opens is drawn outside its grid.')
    return state
  }

  // A real button, 44 pixels square, saying which way it goes. The grid does not draw a cell again when its row
  // opens, so the button follows the row itself.
  function OpenRowCell({ data, node }: CustomCellRendererProps<Row>) {
    const { toggle, toggleLabel } = useMasterDetail()
    const [open, setOpen] = useState(node.expanded)
    useEffect(() => {
      const follow = () => { setOpen(node.expanded) }
      node.addEventListener('expandedChanged', follow)
      return () => { node.removeEventListener('expandedChanged', follow) }
    }, [node])
    if (data === undefined) return null
    return (
      <button
        type="button"
        aria-expanded={open}
        aria-label={toggleLabel(data, open)}
        onClick={() => { toggle(node) }}
        className="grid size-11 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronRight aria-hidden="true" className={open ? 'size-4 rotate-90 transition-transform motion-reduce:transition-none' : 'size-4 transition-transform motion-reduce:transition-none'} />
      </button>
    )
  }

  // A row of the grid holds cells, so the opened row is one cell across the whole grid. Its height is its content's,
  // which the grid measures to size the row.
  function DetailRowCell({ data }: CustomCellRendererProps<Row>) {
    const { idOf, nameOf, focusOnOpen, renderDetail } = useMasterDetail()
    const heading = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
      if (data === undefined || focusOnOpen.current !== idOf(data)) return
      focusOnOpen.current = null
      heading.current?.focus()
    }, [data, focusOnOpen, idOf])
    if (data === undefined) return null
    return (
      <div role="gridcell" className="min-w-0">
        <section aria-label={nameOf(data)} className="@container min-w-0 border-l-4 border-primary bg-background px-5 py-6 whitespace-normal text-foreground md:px-8">
          <div className="max-w-5xl">{renderDetail(data, { ref: heading })}</div>
        </section>
      </div>
    )
  }

  return { MasterDetailProvider: Context.Provider, OpenRowCell, DetailRowCell }
}
