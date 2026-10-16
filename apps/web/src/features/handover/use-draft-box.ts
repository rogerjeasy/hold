'use client'

import { checkRegion } from '@hold/domain'
import type { Region } from '@hold/domain'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useRef, useState } from 'react'

// The box staff place on a photograph for a new mark: in the middle to start, moved with the arrow keys or dragged, and
// sized with Shift and the arrow keys. It never leaves the photograph.

const START: Region = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }
const STEP = 0.01
const round = (value: number) => Math.round(value * 100) / 100

const MOVES: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function within(region: Region): Region {
  const width = Math.min(1, Math.max(STEP, round(region.width)))
  const height = Math.min(1, Math.max(STEP, round(region.height)))
  return { x: round(Math.min(1 - width, Math.max(0, region.x))), y: round(Math.min(1 - height, Math.max(0, region.y))), width, height }
}

export function useDraftBox() {
  const [box, setBox] = useState<Region | undefined>(undefined)
  const dragging = useRef<{ readonly startX: number; readonly startY: number; readonly from: Region; readonly frame: DOMRect } | undefined>(undefined)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const move = MOVES[event.key]
    if (box === undefined || move === undefined) return
    event.preventDefault()
    const [dx, dy] = move
    setBox(within(event.shiftKey ? { ...box, width: box.width + dx * STEP, height: box.height + dy * STEP } : { ...box, x: box.x + dx * STEP, y: box.y + dy * STEP }))
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const frame = event.currentTarget.parentElement?.getBoundingClientRect()
    if (box === undefined || frame === undefined) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = { startX: event.clientX, startY: event.clientY, from: box, frame }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragging.current
    if (drag === undefined || drag.frame.width === 0 || drag.frame.height === 0) return
    setBox(within({ ...drag.from, x: drag.from.x + (event.clientX - drag.startX) / drag.frame.width, y: drag.from.y + (event.clientY - drag.startY) / drag.frame.height }))
  }

  const onPointerUp = () => {
    dragging.current = undefined
  }

  return {
    box,
    valid: box !== undefined && checkRegion(box),
    place: () => {
      setBox(START)
    },
    clear: () => {
      setBox(undefined)
    },
    handlers: { onKeyDown, onPointerDown, onPointerMove, onPointerUp },
  }
}
