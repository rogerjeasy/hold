import { GROUNDS } from '@hold/domain'
import type { NegotiationSide } from '@hold/domain'
import type { NegotiationTool } from '@hold/db'

// The port for one advocate's move (extensions.md section 9.13). A move is a short conversation of its own: the
// advocate reads the evidence through read-only tools over a few turns, then calls exactly one move. Each side's
// conversation is a separate series of requests with its own context, so one side's limits never enter the other's.

export type AdvocateImage = { readonly mediaType: 'image/jpeg' | 'image/png'; readonly data: string }
export type ToolResultPart = { readonly type: 'text'; readonly text: string } | { readonly type: 'image'; readonly image: AdvocateImage }
export type ToolCall = { readonly id: string; readonly name: string; readonly input: unknown }
export type ToolResult = { readonly callId: string; readonly parts: readonly ToolResultPart[]; readonly isError: boolean }

export type AdvocateMessage =
  // Hold's instruction that opens the move. It carries no records: those come back from the tools, as quoted data.
  | { readonly role: 'user'; readonly text: string }
  // What the model answered. `raw` is the model's own content, kept so the adapter can send it back as it was.
  | { readonly role: 'assistant'; readonly calls: readonly ToolCall[]; readonly raw: unknown }
  | { readonly role: 'tool_results'; readonly results: readonly ToolResult[] }

export type AdvocateRequest = { readonly side: NegotiationSide; readonly system: string; readonly messages: readonly AdvocateMessage[] }
export type Usage = { readonly model: string; readonly inputTokens: number; readonly outputTokens: number }
export type AdvocateReply =
  | ({ readonly kind: 'calls'; readonly calls: readonly ToolCall[]; readonly raw: unknown } & Usage)
  // The model declined, could not be reached, or answered without calling a tool. The side then passes.
  | ({ readonly kind: 'refused' | 'unavailable' | 'no_move' } & Usage)
export type AdvocateModel = { next(request: AdvocateRequest, signal: AbortSignal): Promise<AdvocateReply> }

const nothing = { type: 'object', additionalProperties: false, required: [], properties: {} } as const

// The read-only tools. None changes anything, none takes an amount, and what they return is quoted data.
export const EVIDENCE_TOOLS = [
  { name: 'get_negotiation', description: 'The negotiation so far, as your side sees it: whose move it is, the claim’s lines with what code checked about each, your own limits, the offers each side has left, the last offers and the transcript. It never holds the other side’s limits.', input_schema: nothing },
  { name: 'get_claim_lines', description: 'Each claim line with its finding: what the photo comparison saw, its class and confidence, how well the photographs aligned, and whether the independent second look confirmed it. A line a person added has no finding.', input_schema: nothing },
  { name: 'get_line_photos', description: 'The handover and return photographs of one claim line’s view, as images.', input_schema: { type: 'object', additionalProperties: false, required: ['lineId'], properties: { lineId: { type: 'string' } } } },
  { name: 'get_price_list', description: 'The damage price list and the wear policy the renter agreed to at booking, with their versions. The wear clause ids are what ordinary_wear cites.', input_schema: nothing },
  { name: 'get_known_marks', description: 'The marks on the rented items that were seen before this rental. Their ids are what known_mark cites.', input_schema: nothing },
  { name: 'get_condition_report', description: 'The condition report from the handover: each item’s recorded marks, and what the renter answered to it.', input_schema: nothing },
] as const
export type EvidenceToolName = (typeof EVIDENCE_TOOLS)[number]['name']

// Exactly three moves, with closed schemas: every field required and nothing else allowed. They are not sent in strict
// mode while Hold runs on Opus 4.6 (tech-stack.md section 6); the database checks the same shape again with its own
// schemas before the referee sees the move. No tool takes words: what reaches the other side is amounts, grounds and
// record ids only.
export const MOVE_TOOLS = [
  {
    name: 'offer',
    description: 'Your move: offer a full list of the claim’s lines, each with an amount in cents between zero and its published price, and for each lowered line one ground and the ids of the records it cites.',
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
  { name: 'accept', description: 'Your move: accept the other side’s last offer as it stands.', input_schema: nothing },
  { name: 'pass', description: 'Your move: end the negotiation without agreement. The shop’s owner will decide.', input_schema: nothing },
] as const

export const ADVOCATE_TOOLS = [...EVIDENCE_TOOLS, ...MOVE_TOOLS] as const

const MOVE_NAMES: readonly string[] = MOVE_TOOLS.map((tool) => tool.name)
export const isMoveTool = (name: string): name is NegotiationTool => MOVE_NAMES.includes(name)
const EVIDENCE_NAMES: readonly string[] = EVIDENCE_TOOLS.map((tool) => tool.name)
export const isEvidenceTool = (name: string): name is EvidenceToolName => EVIDENCE_NAMES.includes(name)
