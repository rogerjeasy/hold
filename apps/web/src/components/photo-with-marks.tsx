'use client'

import type { Region } from '@hold/domain'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { RegionBox } from './region-box'

type PhotoWithMarksProps = {
  src: string
  alt: string
  marks: readonly { readonly id: string; readonly region: Region; readonly confirmed?: boolean }[]
  // Drawn over the photograph too, such as a box being placed.
  children?: ReactNode
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
    <div className="relative w-full overflow-hidden border bg-muted" style={{ aspectRatio: shape }}>
      {/* A plain image: the source is a short-lived signed link, which the image optimiser must not cache. */}
      <img ref={image} src={src} alt={alt} className="absolute inset-0 size-full" />
      {marks.map((mark) => (
        <RegionBox key={mark.id} data-mark={mark.id} region={mark.region} className={mark.confirmed === false ? 'border-dashed border-amber-500' : 'border-primary'} aria-hidden="true" />
      ))}
      {children}
    </div>
  )
}
