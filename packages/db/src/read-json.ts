import type { z } from 'zod'

// A jsonb object or array read through raw SQL or a function comes from Aurora's Data API as text, and from the local
// driver already decoded. Both are read the same way here, then checked against the schema they must match.
export function readJson<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  return schema.parse(typeof value === 'string' ? JSON.parse(value) as unknown : value)
}
