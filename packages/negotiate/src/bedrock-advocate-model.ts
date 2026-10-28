import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import type { Anthropic } from '@anthropic-ai/sdk'
import { ADVOCATE_TOOLS } from './advocate-model.ts'
import type { AdvocateMessage, AdvocateModel, ToolResultPart } from './advocate-model.ts'
import { ADVOCATE_MODEL } from './prompts.ts'

// Only this adapter reaches Bedrock for an advocate. One request per turn of a move, no retries inside it, a small
// output ceiling, the read-only tools and the three moves as closed-schema tools with automatic choice, explicit
// effort, and a refusal handled as a normal outcome. The model's own content goes back as it came, so its thinking
// carries from one turn of the move to the next.

const part = (each: ToolResultPart) => (each.type === 'text' ? { type: 'text' as const, text: each.text } : { type: 'image' as const, source: { type: 'base64' as const, media_type: each.image.mediaType, data: each.image.data } })

type Message = Anthropic.Beta.Messages.BetaMessageParam
type Block = Anthropic.Beta.Messages.BetaContentBlockParam

function messageOf(message: AdvocateMessage): Message {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: [{ type: 'text', text: message.text }] }
    case 'assistant':
      return { role: 'assistant', content: Array.isArray(message.raw) ? (message.raw as Block[]) : message.calls.map((call) => ({ type: 'tool_use' as const, id: call.id, name: call.name, input: call.input })) }
    case 'tool_results':
      return { role: 'user', content: message.results.map((result) => ({ type: 'tool_result' as const, tool_use_id: result.callId, is_error: result.isError, content: result.parts.map(part) })) }
  }
}

export function createBedrockAdvocateModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>, timeoutMilliseconds = 60_000): AdvocateModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0, timeout: timeoutMilliseconds })
  return {
    async next(request, signal) {
      try {
        const response = await client.beta.messages.create({
          model: ADVOCATE_MODEL,
          max_tokens: 4096,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          tools: ADVOCATE_TOOLS.map((tool) => ({ ...tool, input_schema: { ...tool.input_schema } })),
          tool_choice: { type: 'auto' },
          system: request.system,
          messages: request.messages.map(messageOf),
        }, { signal })
        const usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        if (response.stop_reason === 'refusal') return { kind: 'refused', ...usage }
        const calls = response.content.flatMap((block) => (block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : []))
        if (response.stop_reason !== 'tool_use' || calls.length === 0) return { kind: 'no_move', ...usage }
        return { kind: 'calls', calls, raw: response.content, ...usage }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: ADVOCATE_MODEL, inputTokens: 0, outputTokens: 0 }
        throw error
      }
    },
  }
}
