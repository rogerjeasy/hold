// An undo history for the draft: every change can be taken back and taken back again, a paste of forty rows as much
// as one cell. A plain reducer, so the editor's hook is a thin wrapper around it.

export type History<State> = { readonly past: readonly State[]; readonly present: State; readonly future: readonly State[] }
export type HistoryAction<State> = { readonly kind: 'set'; readonly next: State } | { readonly kind: 'undo' } | { readonly kind: 'redo' } | { readonly kind: 'reset'; readonly present: State }

// Enough for a morning's editing; the oldest steps go first.
export const HISTORY_LIMIT = 100

export const startHistory = <State>(present: State): History<State> => ({ past: [], present, future: [] })

export function historyReducer<State>(state: History<State>, action: HistoryAction<State>): History<State> {
  switch (action.kind) {
    case 'set':
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.next, future: [] }
    case 'undo': {
      const previous = state.past.at(-1)
      return previous === undefined ? state : { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      return next === undefined ? state : { past: [...state.past, state.present], present: next, future: rest }
    }
    case 'reset':
      return startHistory(action.present)
  }
}
