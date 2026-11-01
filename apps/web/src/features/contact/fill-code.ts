// Puts a one-time code into the field that asks for it, as if typed, and moves to it. The field is uncontrolled, so the
// form sends what is set here.
export function fillCode(inputId: string, code: string): void {
  const field = document.getElementById(inputId)
  if (!(field instanceof HTMLInputElement)) return
  field.value = code
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.focus()
}

// The code in a text Hold sent: the last line, which the phone reads, ends with it.
export function codeInText(text: string): string | undefined {
  return /#([0-9]{8})\s*$/.exec(text)?.[1]
}
