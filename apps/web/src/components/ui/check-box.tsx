import { Check } from 'lucide-react'

type CheckBoxProps = {
  label: string
  // Kept for screen readers only, where the row around the box already says what it is.
  hideLabel?: boolean
  checked: boolean
  onChange: (checked: boolean) => void
}

// A checkbox drawn at the size of text, as the design wants, whose real control is an invisible input filling a 44
// pixel square on top of the drawing, so the whole square takes a tap and the keyboard's focus (AGENTS.md section 9).
export function CheckBox({ label, hideLabel = false, checked, onChange }: CheckBoxProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold">
      <span className="relative grid size-11 shrink-0 place-items-center">
        <input type="checkbox" checked={checked} onChange={(event) => { onChange(event.target.checked) }} className="peer absolute inset-0 size-11 cursor-pointer opacity-0" />
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-md border-2 border-border-strong bg-card transition-[background-color,border-color] duration-150 text-primary-foreground peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </span>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
    </label>
  )
}
