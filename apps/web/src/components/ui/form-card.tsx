import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// One group of a settings form, as a card: its legend names it and says what it is for, the fields sit below.
// The legend floats so it is drawn inside the card rather than across its edge, and still names the group.
export function FormCard({ title, help, icon: Icon, children }: { title: string; help?: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <fieldset className="surface min-w-0 overflow-clip">
      <legend className="float-left flex w-full items-start gap-3 border-b border-border/70 px-4 py-4 md:px-5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
        <span className="block min-w-0">
          <span className="block text-[1.0625rem] leading-tight font-extrabold tracking-tight wrap-long-words">{title}</span>
          {help === undefined ? null : <span className="mt-1 block max-w-prose text-sm text-muted-foreground">{help}</span>}
        </span>
      </legend>
      <div className="clear-both grid min-w-0 gap-4 p-4 md:p-5">{children}</div>
    </fieldset>
  )
}
