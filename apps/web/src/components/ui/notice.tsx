import { CircleAlert, CircleCheck, Info } from "lucide-react"
import type { ReactNode } from "react"

// A tone adds a coloured edge and icon. The title always says what the colour means, so colour is never the only sign.
type Tone = "neutral" | "warning" | "destructive" | "success"

type NoticeProps = {
  title: string
  body: string
  // A notice that appears in answer to something the reader did is announced. One that was always there is not.
  announced?: boolean
  tone?: Tone
  children?: ReactNode
}

const EDGE: Readonly<Record<Tone, string>> = {
  neutral: "",
  warning: "border-l-4 border-l-warning",
  destructive: "border-l-4 border-l-destructive",
  success: "border-l-4 border-l-success",
}

const ICON: Readonly<Record<Tone, string>> = {
  neutral: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-success",
}

function Notice({ title, body, announced = false, tone = "neutral", children }: NoticeProps) {
  const Icon = tone === "success" ? CircleCheck : tone === "neutral" ? Info : CircleAlert
  return (
    <div role={announced ? "alert" : "note"} data-slot="notice" className={`flex gap-3 border border-border-strong bg-card p-4 text-card-foreground md:p-5 ${EDGE[tone]}`}>
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${ICON[tone]}`} />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  )
}

export { Notice }
