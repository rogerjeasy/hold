import { PRICE_CATEGORIES } from '@hold/domain'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { z } from 'zod'
import type { Draft } from './editor-model'
import { historyReducer, startHistory } from './history'

// The draft with its undo history, kept in this browser until it is published, so a closed tab loses nothing. A
// draft made from another version than the one now in force is not brought back: it would hide that version's changes.

const savedSchema = z.object({
  baseVersion: z.number().int().nullable(),
  draft: z.object({
    rows: z.array(z.object({ key: z.number().int(), description: z.string().max(500), category: z.enum(PRICE_CATEGORIES), amount: z.string().max(40) })).min(1).max(200),
    wearPolicy: z.string().max(5000),
  }),
})

const storageKey = (shopId: string) => `hold.priceDraft.${shopId}`

function readSaved(shopId: string, baseVersion: number | null): Draft | undefined {
  try {
    const raw = localStorage.getItem(storageKey(shopId))
    if (raw === null) return undefined
    const saved = savedSchema.safeParse(JSON.parse(raw))
    return saved.success && saved.data.baseVersion === baseVersion ? saved.data.draft : undefined
  } catch {
    return undefined
  }
}

function write(shopId: string, value: { baseVersion: number | null; draft: Draft } | undefined) {
  try {
    if (value === undefined) localStorage.removeItem(storageKey(shopId))
    else localStorage.setItem(storageKey(shopId), JSON.stringify(value))
  } catch {
    // Storage can be off or full; the draft then lives as long as the page.
  }
}

export function useDraft(shopId: string, baseVersion: number | null, published: Draft) {
  const [history, dispatch] = useReducer(historyReducer<Draft>, published, startHistory)
  const [restored, setRestored] = useState(false)
  const ready = useRef(false)

  // Read once in the browser after the page is drawn, so the server's page and the browser's first one agree.
  useEffect(() => {
    const saved = readSaved(shopId, baseVersion)
    if (saved !== undefined) {
      dispatch({ kind: 'reset', present: saved })
      setRestored(true)
    }
    ready.current = true
  }, [shopId, baseVersion])

  useEffect(() => {
    if (!ready.current) return
    write(shopId, history.present === published ? undefined : { baseVersion, draft: history.present })
  }, [history.present, published, shopId, baseVersion])

  return {
    draft: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    restored,
    change: useCallback((next: Draft) => { dispatch({ kind: 'set', next }) }, []),
    undo: useCallback(() => { dispatch({ kind: 'undo' }) }, []),
    redo: useCallback(() => { dispatch({ kind: 'redo' }) }, []),
    // Back to the version in force, forgetting the saved draft.
    discard: useCallback(() => {
      dispatch({ kind: 'reset', present: published })
      setRestored(false)
      write(shopId, undefined)
    }, [published, shopId]),
  }
}
