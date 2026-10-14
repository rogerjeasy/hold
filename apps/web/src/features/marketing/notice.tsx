import { Info } from 'lucide-react'

export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div role="note" className="flex gap-3 border border-border-strong bg-card p-4 md:p-5">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
