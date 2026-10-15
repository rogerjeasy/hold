import { cn } from 'cn'

// One number in a strip of figures, such as the Today page's: what it counts, the number and a line about it. The
// strip is a <dl> laid out by its caller.
export function Figure({ label, value, note, urgent = false }: { label: string; value: string; note: string; urgent?: boolean }) {
  return (
    <div className="min-w-0 p-4 odd:border-r max-xl:nth-[-n+2]:border-b md:p-5 xl:not-last:border-r">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-figure wrap-long-words">
        {/* The colour sits on its own element: merged with the size, cn would keep only one of them. */}
        <span className={cn(urgent && 'text-primary')}>{value}</span>
      </dd>
      <dd className="mt-1.5 text-[0.8125rem] text-muted-foreground">{note}</dd>
    </div>
  )
}
