import { cn } from 'cn'

// A state in a word or two, on a tinted pill with a dot. The words carry the meaning; the colour only repeats it.
export type StatusTone = 'neutral' | 'progress' | 'attention' | 'success' | 'danger'

const TONE: Readonly<Record<StatusTone, string>> = {
  neutral: 'bg-muted text-foreground/80 [--dot:var(--muted-foreground)]',
  progress: 'bg-primary/10 text-primary [--dot:var(--primary)]',
  attention: 'bg-warning/12 text-warning [--dot:var(--warning)]',
  success: 'bg-success/12 text-success [--dot:var(--success)]',
  danger: 'bg-destructive/10 text-destructive [--dot:var(--destructive)]',
}

export function StatusPill({ tone = 'neutral', live = false, children, className }: { tone?: StatusTone; live?: boolean; children: string; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] leading-none font-semibold', TONE[tone], className)}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full bg-(--dot)', live && 'animate-pulse-ring text-(--dot)')} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}
