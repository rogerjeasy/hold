import { cn } from 'cn'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { evidencePhoto } from './evidence-photo'

type EvidenceLayerProps = {
  src: string
  alt: string
  preload?: boolean
  className?: string
  children?: ReactNode
}

export function EvidenceLayer({ src, alt, preload = false, className, children }: EvidenceLayerProps) {
  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <div className="evidence-canvas">
        <Image
          src={src}
          alt={alt}
          fill
          preload={preload}
          sizes="(min-width: 80rem) 80rem, (min-width: 40rem) 100vw, 292vw"
          className="object-cover"
        />
        {children ? (
          <svg viewBox={`0 0 ${String(evidencePhoto.width)} ${String(evidencePhoto.height)}`} aria-hidden="true" className="absolute inset-0 size-full">
            {children}
          </svg>
        ) : null}
      </div>
    </div>
  )
}
