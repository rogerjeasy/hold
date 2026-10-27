import { GROUNDS } from '@hold/domain'
import type { NegotiationSide } from '@hold/domain'
import type { NegotiationTool } from '@hold/db'

// The port for one advocate's turn (extensions.md section 9.13). Each call is a separate request with its own context:
// the system prompt for its side and one message holding the negotiation as quoted data.

export type AdvocateRequest = { readonly side: NegotiationSide; readonly system: string; readonly message: string }
export type AdvocateReply =
  | { readonly kind: 'move'; readonly tool: NegotiationTool; readonly input: unknown; readonly model: string; readonly inputTokens: number; readonly outputTokens: number }
  // The model declined, could not be reached, or answered without a move. The side then passes.
  | { readonly kind: 'refused' | 'unavailable' | 'no_move'; readonly model: string; readonly inputTokens: number; readonly outputTokens: number }
export type AdvocateModel = { move(request: AdvocateRequest, signal: AbortSignal): Promise<AdvocateReply> }

const nothing = { type: 'object', additionalProperties: false, required: [], properties: {} } as const

// Exactly three tools, with strict schemas: every field required and nothing else allowed. The database checks the
// same shape again with its own schemas before the referee sees the move. No tool takes words: what reaches the other
// side is amounts, grounds and record ids only.
export const ADVOCATE_TOOLS = [
  {
    name: 'offer',
    description: 'Offer a full list of the claim’s lines, each with an amount in cents between zero and its published price, and for each lowered line one ground and the ids of the records it cites.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['lines'],
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['lineId', 'cents', 'ground', 'evidence'],
            properties: {
              lineId: { type: 'string' },
              cents: { type: 'integer' },
              ground: { anyOf: [{ type: 'string', enum: [...GROUNDS] }, { type: 'null' }] },
              evidence: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  { name: 'accept', description: 'Accept the other side’s last offer as it stands.', strict: true, input_schema: nothing },
  { name: 'pass', description: 'End the negotiation without agreement. The shop’s owner will decide.', strict: true, input_schema: nothing },
] as const
