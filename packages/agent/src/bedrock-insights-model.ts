import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { z } from 'zod'
import { INSIGHTS_MODEL } from './insights-model.ts'
import type { InsightsModel } from './insights-model.ts'
import type { InsightsReply } from './insights-protocol.ts'

// Why Bedrock turned a turn away, for the audit trail: the status, the error's kind and what it says about the
// request, cut short. Anthropic's errors nest the kind and message; Bedrock's carry a message alone.
const REASON_LENGTH = 240
const errorBody = z.object({ error: z.object({ type: z.string().optional(), message: z.string().optional() }).optional(), message: z.string().optional() })

function reasonFor(error: APIError | APIConnectionError | APIUserAbortError): string {
  if (error instanceof APIUserAbortError) return 'cancelled'
  if (error instanceof APIConnectionError) return `connection: ${error.message}`.slice(0, REASON_LENGTH)
  const body = errorBody.safeParse(error.error)
  const kind = body.success ? body.data.error?.type : undefined
  const said = (body.success ? (body.data.error?.message ?? body.data.message) : undefined) ?? error.message
  return `${String(error.status ?? 'no status')} ${kind === undefined ? '' : `${kind}: `}${said}`.slice(0, REASON_LENGTH)
}

// Only this adapter reaches Bedrock for the insights agent. Thinking stays off: AG Studio keeps no signature with the
// reasoning it is given back, and its loop forces a tool in delegated runs. Tools are not strict: Opus 4.6 is not among
// the models that take strict tools, and AG Studio checks every argument itself. Effort is set, nothing is retried, and
// an unreachable model is an ordinary outcome the dashboard explains.
export function createBedrockInsightsModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>): InsightsModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0 })
  return {
    simulated: false,
    async reply(request, signal) {
      try {
        const response = await client.beta.messages.create(
          {
            model: INSIGHTS_MODEL,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: request.messages.map((message) => ({ role: message.role, content: [...message.content] })),
            tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: { ...tool.inputSchema, type: 'object' as const } })),
            tool_choice: request.toolChoice,
            output_config: { effort: 'medium' },
          },
          { signal },
        )
        if (response.stop_reason === 'refusal') return { kind: 'refused', model: response.model }
        const content = response.content.flatMap((block): InsightsReply['content'][number][] => {
          if (block.type === 'text') return [{ type: 'text', text: block.text }]
          if (block.type === 'tool_use') return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> }]
          return []
        })
        return { kind: 'reply', reply: { id: response.id, model: response.model, stopReason: response.stop_reason ?? 'end_turn', usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }, content } }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: INSIGHTS_MODEL, reason: reasonFor(error) }
        throw error
      }
    },
  }
}
