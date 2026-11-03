import { buttonVariants } from '@/components/ui/button'

// Small pieces an opened record shares, wherever it opens: a labelled fact, a section's heading and a link onward.

// A link onward reads as a quiet button, so it is a large target and never mistaken for the record's own words.
export const detailLinkClass = buttonVariants({ variant: 'outline', className: 'justify-self-start' })

export function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-xl border border-border/70 bg-card px-3.5 py-2.5">
      <dt className="label text-xs text-muted-foreground">{label}</dt>
      <dd className="figures font-semibold wrap-long-words" data-testid={testId}>{value}</dd>
    </div>
  )
}

export function SubHeading({ children }: { children: string }) {
  return <h3 className="label text-xs text-muted-foreground">{children}</h3>
}
