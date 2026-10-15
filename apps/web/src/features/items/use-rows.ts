'use client'

import { useState } from 'react'

export type Keyed<Row> = Row & { readonly key: number }

// An editable list of form rows, each with a stable key so React keeps its inputs when rows move or go.
export function useRows<Row extends object>(initial: readonly Row[]) {
  const [state, setState] = useState(() => ({ rows: initial.map((row, key) => ({ ...row, key })), next: initial.length }))
  return {
    rows: state.rows as readonly Keyed<Row>[],
    add: (row: Row) => {
      setState(({ rows, next }) => ({ rows: [...rows, { ...row, key: next }], next: next + 1 }))
    },
    remove: (key: number) => {
      setState(({ rows, next }) => ({ rows: rows.filter((row) => row.key !== key), next }))
    },
    update: (key: number, patch: Partial<Row>) => {
      setState(({ rows, next }) => ({ rows: rows.map((row) => (row.key === key ? { ...row, ...patch } : row)), next }))
    },
    // Swaps a row with its neighbour, one place up (-1) or down (+1).
    move: (key: number, by: -1 | 1) => {
      setState(({ rows, next }) => {
        const from = rows.findIndex((row) => row.key === key)
        const to = from + by
        const [moving, other] = [rows[from], rows[to]]
        if (moving === undefined || other === undefined) return { rows, next }
        const moved = [...rows]
        moved[from] = other
        moved[to] = moving
        return { rows: moved, next }
      })
    },
    replace: (rows: readonly Row[]) => {
      setState(({ next }) => ({ rows: rows.map((row, index) => ({ ...row, key: next + index })), next: next + rows.length }))
    },
  }
}

export type Rows<Row extends object> = ReturnType<typeof useRows<Row>>
