import { cn } from 'cn'

// A shape standing in for content on its way. Hidden from screen readers: the region around it says it is loading.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn('skeleton', className)} />
}
