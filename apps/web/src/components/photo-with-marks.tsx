'use client'

import type { Region } from '@hold/domain'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { RegionBox } from './region-box'

type PhotoWithMarksProps = {
  src: string
  alt: string
  // A finding is drawn in the accent, dashed while unconfirmed; the truth, where a labelled damage really is, as a
  // thicker outline of its own colour just outside its region, so both show when a finding lands exactly on it, and a
  // page can say which is which in words beside it.
  marks: readonly { readonly id: string; readonly region: Region; readonly confirmed?: boolean; readonly tone?: 'finding' | 'truth' }[]
  // Drawn over the photograph too, such as a box being placed.
  children?: ReactNode
}

// A finding's outline draws itself in, so the eye goes to it; a dark halo keeps it readable on a light photograph.
function DrawnOutline({ dashed }: { dashed: boolean }) {
  return (
    <svg aria-hidden="true" className="absolute -inset-px size-[calc(100%+2px)] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" rx="3" fill="none" className="stroke-photo-scrim" strokeWidth="5" vectorEffect="non-scaling-stroke" opacity="0.45" />
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="3"
        pathLength={1000}
        fill="none"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        className={cn(dashed ? 'stroke-warning [stroke-dasharray:24_16]' : 'animate-draw stroke-mark [stroke-dasharray:1000]')}
      />
    </svg>
  )
}

// A photograph shown whole, at its own shape, with each mark boxed where it was drawn. A mark's box is a share of the
// photograph, so the frame must be exactly the photograph: never cropped. A 4:3 space is kept while it loads.
export function PhotoWithMarks({ src, alt, marks, children }: PhotoWithMarksProps) {
  const [shape, setShape] = useState('4 / 3')
  const image = useRef<HTMLImageElement>(null)
  // A native listener, and a look at an image already loaded: on a page drawn on the server, the photograph can load
  // before the page comes alive, when no load event reaches React.
  useEffect(() => {
    const element = image.current
    if (element === null) return
    const read = () => {
      if (element.naturalWidth > 0 && element.naturalHeight > 0) setShape(`${String(element.naturalWidth)} / ${String(element.naturalHeight)}`)
    }
    if (element.complete) read()
    element.addEventListener('load', read)
    return () => {
      element.removeEventListener('load', read)
    }
  }, [src])
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-photo shadow-xs ring-1 ring-border/70" style={{ aspectRatio: shape }}>
      {/* A plain image: the source is a short-lived signed link, which the image optimiser must not cache. */}
      <img ref={image} src={src} alt={alt} className="absolute inset-0 size-full animate-fade" />
      {marks.map((mark) =>
        mark.tone === 'truth' ? (
          <RegionBox key={mark.id} data-mark={mark.id} data-tone="truth" region={mark.region} className="rounded-sm border-0 outline-3 outline-offset-3 outline-success" aria-hidden="true" />
        ) : (
          <RegionBox key={mark.id} data-mark={mark.id} data-tone="finding" region={mark.region} className="border-0" aria-hidden="true">
            <DrawnOutline dashed={mark.confirmed === false} />
          </RegionBox>
        ),
      )}
      {children}
    </div>
  )
}
