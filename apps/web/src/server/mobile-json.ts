import 'server-only'
import type { Failure } from '@hold/mobile-api'
import { readCappedBody } from './capped-body'

// What every /api/mobile/v1 route shares: a small JSON body read as an object, that object as the form a server
// function takes, and an answer in the shared envelope with an HTTP status the phone can read.

// The phone's quick actions carry a few short fields.
export const MOBILE_BODY_MAX_BYTES = 16 * 1024

const STATUS: Record<Failure, number> = {
  invalid: 400,
  signed_out: 401,
  link_invalid: 401,
  no_shop: 403,
  role: 403,
  scope: 403,
  passkey_needed: 403,
  not_found: 404,
  refused: 409,
  rate_limited: 429,
}

export type MobileAnswer =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: Failure; readonly fields?: readonly string[]; readonly reason?: string }

// Never cached anywhere between the server and the phone: every answer is one person's.
export function answer(result: MobileAnswer): Response {
  const status = result.ok ? 200 : STATUS[result.failure]
  return Response.json(result, { status, headers: { 'cache-control': 'no-store' } })
}

export const failed = (failure: Failure, extra: { readonly fields?: readonly string[]; readonly reason?: string } = {}): MobileAnswer => ({ ok: false, failure, ...extra })

// The body as a plain object, or nothing for one too large, not JSON, or not an object.
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  const body = await readCappedBody(request, MOBILE_BODY_MAX_BYTES)
  if (!body.ok) return undefined
  try {
    const parsed: unknown = JSON.parse(body.text === '' ? '{}' : body.text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

type FormValue = string | number | boolean

const isFormValue = (value: unknown): value is FormValue => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean'

// The object as the form a browser would send: text, numbers and true or false as text, and a list as the field sent
// more than once. Anything else, such as an object or null, is named as a field the action cannot take.
export function formFromJson(object: Record<string, unknown>): { readonly ok: true; readonly form: FormData } | { readonly ok: false; readonly fields: readonly string[] } {
  const form = new FormData()
  const refused: string[] = []
  for (const [name, value] of Object.entries(object)) {
    const values: unknown[] = Array.isArray(value) ? value : [value]
    if (!values.every(isFormValue)) {
      refused.push(name)
      continue
    }
    for (const each of values) form.append(name, String(each))
  }
  return refused.length === 0 ? { ok: true, form } : { ok: false, fields: refused }
}
