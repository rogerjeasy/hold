import { z } from 'zod'

// A money log line's reference names a PayPal resource, with what happened to it after a colon where one resource
// has several lines, such as an authorization placed, then voided.
export const resourceOf = (reference: string) => reference.split(':')[0] ?? reference

const eventBody = z.object({ resource: z.object({ id: z.string() }) })

// The PayPal resource a stored event is about, read from the body PayPal signed.
export function eventResourceId(rawBody: string): string | undefined {
  try {
    const parsed = eventBody.safeParse(JSON.parse(rawBody))
    return parsed.success ? parsed.data.resource.id : undefined
  } catch {
    return undefined
  }
}
