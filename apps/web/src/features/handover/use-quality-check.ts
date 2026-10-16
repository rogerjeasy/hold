'use client'

import type { PhotoMeasures } from '@hold/domain'
import { useCallback, useEffect, useRef } from 'react'

type Pending = (measures: PhotoMeasures | undefined) => void

// Measures a photograph in the quality worker. Undefined when it cannot, such as on a browser without workers: the
// photograph is then taken as it is, and the comparison's own check catches a bad one later.
export function useQualityCheck(): (image: ImageData) => Promise<PhotoMeasures | undefined> {
  const worker = useRef<Worker | undefined>(undefined)
  const pending = useRef(new Map<number, Pending>())
  const next = useRef(0)
  useEffect(() => {
    if (typeof Worker === 'undefined') return
    const created = new Worker(new URL('./quality-worker.ts', import.meta.url), { type: 'module' })
    const waiting = pending.current
    created.onmessage = (event: MessageEvent<{ id: number; measures: PhotoMeasures | undefined }>) => {
      waiting.get(event.data.id)?.(event.data.measures)
      waiting.delete(event.data.id)
    }
    worker.current = created
    return () => {
      created.terminate()
      for (const resolve of waiting.values()) resolve(undefined)
      waiting.clear()
    }
  }, [])
  return useCallback((image: ImageData) => {
    const current = worker.current
    if (current === undefined) return Promise.resolve(undefined)
    next.current += 1
    const id = next.current
    return new Promise<PhotoMeasures | undefined>((resolve) => {
      pending.current.set(id, resolve)
      current.postMessage({ id, data: image.data, width: image.width, height: image.height })
    })
  }, [])
}
