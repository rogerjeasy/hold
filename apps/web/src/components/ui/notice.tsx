import { CircleAlert, CircleCheck, Info } from "lucide-react"
import type { ReactNode } from "react"

// A tone tints the card and its icon. The title always says what the colour means, so colour is never the only sign.
type Tone = "neutral" | "warning" | "destructive" | "success"

type NoticeProps = {
  title: string
  body: string
  // A notice that appears in answer to something the reader did is announced. One that was always there is not.
  announced?: boolean
  tone?: Tone
  children?: ReactNode
}

const CARD: Readonly<Record<Tone, string>> = {
  neutral: "border-border bg-card",
  warning: "border-warning/30 bg-[color-mix(in_oklab,var(--warning)_7%,var(--card))]",
  destructive: "border-destructive/30 bg-[color-mix(in_oklab,var(--destructive)_6%,var(--card))]",
  success: "border-success/30 bg-[color-mix(in_oklab,var(--success)_7%,var(--card))]",
}

const ICON: Readonly<Record<Tone, string>> = {
  neutral: "bg-primary/10 text-primary",
  warning: "bg-warning/14 text-warning",
  destructive: "bg-destructive/12 text-destructive",
  success: "bg-success/12 text-success",
}

function Notice({ title, body, announced = false, tone = "neutral", children }: NoticeProps) {
  const Icon = tone === "success" ? CircleCheck : tone === "neutral" ? Info : CircleAlert
  return (
    <div role={announced ? "alert" : "note"} data-slot="notice" data-tone={tone} className={`flex animate-rise gap-3.5 rounded-2xl border p-4 text-card-foreground shadow-xs md:p-5 ${CARD[tone]}`}>
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${ICON[tone]}`}>
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="min-w-0 self-center wrap-long-words">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  )
}

export { Notice }
