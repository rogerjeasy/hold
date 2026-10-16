import type { Region } from '@hold/domain'
import { cn } from 'cn'
import type { ComponentProps } from 'react'

// A box on a photograph, placed by its fractions of the photograph's size, so it fits at every width.
export function RegionBox({ region, className, ...props }: { region: Region } & ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn('absolute border-2', className)}
      style={{ left: `${String(region.x * 100)}%`, top: `${String(region.y * 100)}%`, width: `${String(region.width * 100)}%`, height: `${String(region.height * 100)}%` }}
    />
  )
}
