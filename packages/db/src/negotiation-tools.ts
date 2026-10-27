import { GROUNDS, NEGOTIATION_LIMITS } from '@hold/domain'
import { z } from 'zod'

// The three moves an advocate has (extensions.md section 9.13), as strict schemas: every field required, nothing else
// allowed. The same schemas check a call from Hold's advocates and from a renter's own assistant. An offer names line
// amounts in cents; the referee checks each against its published price and the side's mandate.
//
// No move carries words. Free text written by one side's model could carry its limit in some writing to the other side,
// so what crosses is only amounts, grounds and the ids of this rental's records, and the screens word them from fixed
// templates (security review of section 9.13).

export const offerArguments = z.strictObject({
  lines: z.array(z.strictObject({
    lineId: z.string().min(1).max(64),
    cents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    ground: z.enum(GROUNDS).nullable(),
    evidence: z.array(z.string().min(1).max(64)).max(NEGOTIATION_LIMITS.evidencePerLine),
  })).min(1).max(50),
})
export const acceptArguments = z.strictObject({})
export const passArguments = z.strictObject({})

export const NEGOTIATION_TOOLS = { offer: offerArguments, accept: acceptArguments, pass: passArguments } as const
export type NegotiationTool = keyof typeof NEGOTIATION_TOOLS
