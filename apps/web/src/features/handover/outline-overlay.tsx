import type { ViewOutline } from '@hold/domain'

// The framing outline drawn over the camera for each kind of view (architecture.md section 9.1), as fractions of the
// frame, so the same view is taken the same way at handover and return.
const BOXES: Readonly<Record<ViewOutline, { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>> = {
  whole_side: { x: 5, y: 20, width: 90, height: 60 },
  front: { x: 25, y: 8, width: 50, height: 84 },
  rear: { x: 25, y: 8, width: 50, height: 84 },
  top: { x: 12, y: 12, width: 76, height: 76 },
  detail: { x: 30, y: 30, width: 40, height: 40 },
}

export function OutlineOverlay({ outline }: { outline: ViewOutline }) {
  const box = BOXES[outline]
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      <rect x={box.x} y={box.y} width={box.width} height={box.height} rx="2" fill="none" stroke="white" strokeWidth="0.6" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
