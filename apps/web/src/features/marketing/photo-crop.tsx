import { cn } from 'cn'
import type { ReactNode } from 'react'
import { evidencePhoto } from './evidence-photo'

type PhotoCropProps = {
  viewBox: string
  src?: string
  className?: string
  children?: ReactNode
}

// A cut from the evidence photograph that fills its parent. Children are drawn in the photograph's own frame.
export function PhotoCrop({ viewBox, src = evidencePhoto.returnSrc, className, children }: PhotoCropProps) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={cn('absolute inset-0 size-full', className)}>
      <image href={src} width={evidencePhoto.width} height={evidencePhoto.height} preserveAspectRatio="xMidYMid slice" />
      {children}
    </svg>
  )
}
