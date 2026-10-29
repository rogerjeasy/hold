// Small pieces an opened record shares, wherever it opens: a labelled fact, a section's heading and a link onward.

export const detailLinkClass = 'inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4'

export function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="label text-xs text-muted-foreground">{label}</dt>
      <dd className="figures wrap-long-words" data-testid={testId}>{value}</dd>
    </div>
  )
}

export function SubHeading({ children }: { children: string }) {
  return <h3 className="label text-xs text-muted-foreground">{children}</h3>
}
