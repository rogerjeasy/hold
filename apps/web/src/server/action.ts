import 'server-only'
import { auditLog, inShop } from '@hold/db'
import type { Scope, Transaction } from '@hold/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getServices } from './services'

// What every server function shares, whoever calls it: the form read as a plain object, a refusal that undoes what
// the function wrote, and the audit line written in the same transaction as the change (AGENTS.md section 7).

// What a function hands back when it refuses on its own terms. Nothing it wrote is kept.
export class Refusal {
  readonly reason: string
  constructor(reason: string) {
    this.reason = reason
  }
}

class RolledBack extends Error {
  readonly refusal: Refusal
  constructor(refusal: Refusal) {
    super(refusal.reason)
    this.refusal = refusal
  }
}

export type Refused = { readonly ok: false; readonly failure: 'refused'; readonly reason: string }

export type AuditLine = { readonly actorKind: string; readonly actorId: string | null; readonly action: string; readonly subjectKind?: string; readonly subjectId?: string; readonly detail?: Record<string, unknown> }

// Runs the work in one transaction scoped to the shop, writes the audit line with it, and rolls both back on a refusal.
export async function actInScope<Output>(
  scope: Scope,
  work: (transaction: Transaction) => Promise<Output | Refusal>,
  audit: (output: Output) => AuditLine,
): Promise<{ readonly ok: true; readonly value: Output } | Refused> {
  const { database } = await getServices()
  try {
    const value = await inShop(database, scope, async (transaction) => {
      const result = await work(transaction)
      if (result instanceof Refusal) throw new RolledBack(result)
      const line = audit(result)
      await transaction.insert(auditLog).values({ shopId: scope.shopId, ...line, detail: line.detail ?? {} })
      return result
    })
    // The page that sent the form shows the change on its next render.
    revalidatePath('/', 'layout')
    return { ok: true, value }
  } catch (error) {
    if (error instanceof RolledBack) return { ok: false, failure: 'refused', reason: error.refusal.reason }
    throw error
  }
}

// The fields a schema refused, by name.
export const failedFields = (error: z.ZodError) => [...new Set(error.issues.map((issue) => issue.path.join('.')))]

// A form as a plain object. A field sent more than once becomes a list, so a schema can take repeated rows.
// Next.js adds its own fields to a server function's form, which start with "$ACTION" and are left out.
export function formObject(data: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {}
  for (const key of new Set(data.keys())) {
    if (key.startsWith('$ACTION')) continue
    const values = data.getAll(key).filter((value): value is string => typeof value === 'string')
    object[key] = values.length === 1 ? values[0] : values
  }
  return object
}

// How a form's locale and repeated rows are read lives with the phone's contract, so both check input alike.
export { list, withLocale } from '@hold/mobile-api'
