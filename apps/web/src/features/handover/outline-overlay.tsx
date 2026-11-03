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

// How far each corner's bracket runs along its edges, as a share of the frame.
const ARM = 6

// The outline as a faint dashed box with firm corner brackets, the way a camera frames its subject. A soft dark line
// under each keeps it readable over a bright photograph.
export function OutlineOverlay({ outline }: { outline: ViewOutline }) {
  const { x, y, width, height } = BOXES[outline]
  const right = x + width
  const bottom = y + height
  const corners = [
    `M ${String(x)} ${String(y + ARM)} V ${String(y)} H ${String(x + ARM)}`,
    `M ${String(right - ARM)} ${String(y)} H ${String(right)} V ${String(y + ARM)}`,
    `M ${String(right)} ${String(bottom - ARM)} V ${String(bottom)} H ${String(right - ARM)}`,
    `M ${String(x + ARM)} ${String(bottom)} H ${String(x)} V ${String(bottom - ARM)}`,
  ].join(' ')
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      <rect x={x} y={y} width={width} height={height} rx="1.5" fill="none" className="stroke-photo-foreground" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={corners} fill="none" className="stroke-photo-scrim" strokeOpacity="0.5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={corners} fill="none" className="stroke-photo-foreground" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
