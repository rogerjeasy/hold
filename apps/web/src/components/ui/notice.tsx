import { Info } from "lucide-react"

type NoticeProps = {
  title: string
  body: string
  // A notice that appears in answer to something the reader did is announced. One that was always there is not.
  announced?: boolean
}

function Notice({ title, body, announced = false }: NoticeProps) {
  return (
    <div role={announced ? "alert" : "note"} data-slot="notice" className="flex gap-3 border border-border-strong bg-card p-4 text-card-foreground md:p-5">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export { Notice }
