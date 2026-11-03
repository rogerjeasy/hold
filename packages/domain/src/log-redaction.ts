// What may reach a log about an error (AGENTS.md section 7): no tokens, credentials or personal details. A message from
// the database or a provider is free text that can carry a renter's name, an email or a token in a shape no pattern
// foresees, so no message is ever logged. What is logged is known to be safe: the error's name, codes that are plain
// identifiers, an HTTP status, a failed query's text with its placeholders but never its values, and the stack frames.

// A cause rarely nests deeper; this keeps a cause that refers back to its error from running on.
const MAX_CAUSES = 3
const IDENTIFIER = /^[A-Za-z0-9_.-]{1,64}$/
const MAX_QUERY = 300

function field(error: Error, key: string): unknown {
  return (error as unknown as Record<string, unknown>)[key]
}

function identifier(value: unknown): string | undefined {
  const text = typeof value === 'number' ? String(value) : value
  return typeof text === 'string' && IDENTIFIER.test(text) ? text : undefined
}

// The frames after the message, so a line inside a message that only looks like a frame is never taken for one.
function frames(error: Error): string[] {
  const stack = error.stack ?? ''
  const at = error.message === '' ? -1 : stack.indexOf(error.message)
  const rest = at < 0 ? stack.slice(stack.indexOf('\n') + 1) : stack.slice(at + error.message.length)
  return rest.split('\n').filter((line) => /^\s+at \S/.test(line))
}

function describe(error: Error): string {
  const name = identifier(error.name) ?? 'Error'
  const parts = [name]
  for (const key of ['code', 'constraint'] as const) {
    const value = identifier(field(error, key))
    if (value !== undefined) parts.push(`${key}=${value}`)
  }
  const status = field(error, 'status')
  if (typeof status === 'number' && Number.isInteger(status)) parts.push(`status=${String(status)}`)
  // A query's text comes from the code, with its values as placeholders; the values themselves are never read.
  const query = field(error, 'query')
  if (typeof query === 'string') parts.push(`query=${JSON.stringify(query.slice(0, MAX_QUERY))}`)
  return parts.join(' ')
}

// An error as one text: its safe description and stack frames, then each cause in the same way.
export function errorForLog(error: unknown): string {
  if (!(error instanceof Error)) return `a ${typeof error} was thrown`
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current instanceof Error && !seen.has(current) && seen.size <= MAX_CAUSES) {
    seen.add(current)
    parts.push([`${seen.size === 1 ? '' : 'Caused by '}${describe(current)}`, ...frames(current)].join('\n'))
    current = current.cause
  }
  return parts.join('\n')
}
