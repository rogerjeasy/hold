import { cn } from 'cn'

// A segmented control: a row of choices on one rounded track, the chosen one in ink. The choices may be links (a
// filter that is its own address) or buttons (a view switch); the caller marks the chosen one with aria-current or
// aria-pressed, and these classes draw it.
export const SEGMENTED_TRACK = 'inline-flex gap-1 rounded-2xl border bg-card p-1 shadow-xs'

export function segmentClass(chosen: boolean): string {
  return cn(
    'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ease-swift',
    chosen ? 'bg-contrast text-contrast-foreground shadow-xs' : 'text-muted-foreground hover:bg-foreground/6 hover:text-foreground',
  )
}
