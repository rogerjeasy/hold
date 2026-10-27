import 'server-only'
import { takeRateToken } from '@hold/db'
import type { RateLimit } from '@hold/db'
import type { z } from 'zod'
import { failedFields, formObject } from './action'
import { callerNetwork } from './network'
import { getServices } from './services'

// The one way in for a public function that acts for nobody and in no shop, such as the hosted assistant's page
// (extensions.md section 8.10). The network is rate limited and the input validated against a strict schema. Anything
// it does in a shop it does through a gateway of its own, which checks and audits each step.

export type PublicActionResult<Output> =
  | { readonly ok: true; readonly value: Output }
  | { readonly ok: false; readonly failure: 'rate_limited' }
  | { readonly ok: false; readonly failure: 'invalid'; readonly fields: readonly string[] }

export type PublicActionSpec<Input> = { readonly name: string; readonly limit: RateLimit; readonly input: z.ZodType<Input> }

const PUBLIC_ACTIONS = new WeakSet<object>()

export function isPublicAction(value: unknown): boolean {
  return typeof value === 'function' && PUBLIC_ACTIONS.has(value)
}

export function publicAction<Input, Output>(spec: PublicActionSpec<Input>, act: (input: Input) => Promise<Output>): (previous: unknown, data: FormData) => Promise<PublicActionResult<Output>> {
  const action = async (_previous: unknown, data: FormData): Promise<PublicActionResult<Output>> => {
    const { database } = await getServices()
    if (!(await takeRateToken(database, spec.limit, (await callerNetwork()) ?? 'local'))) return { ok: false, failure: 'rate_limited' }
    const parsed = spec.input.safeParse(formObject(data))
    if (!parsed.success) return { ok: false, failure: 'invalid', fields: failedFields(parsed.error) }
    return { ok: true, value: await act(parsed.data) }
  }
  PUBLIC_ACTIONS.add(action)
  return action
}
