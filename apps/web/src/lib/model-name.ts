const CLAUDE = /claude-(opus|sonnet|haiku)-(\d+)-(\d+)/

// The model a record names, as a person reads it: "Claude Opus 4.6" for us.anthropic.claude-opus-4-6-v1. Any other
// name is shown as it was stored, never guessed at.
export function modelName(model: string): string {
  const [, family, major, minor] = CLAUDE.exec(model) ?? []
  if (family === undefined || major === undefined || minor === undefined) return model
  return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}
