import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import { HOSTED_MODEL } from './model.ts'
import type { AssistantModel, Block } from './model.ts'

// Only this adapter reaches Bedrock for the hosted assistant. Tools are not strict: fifteen strict schemas compile past
// Bedrock's grammar limit for Opus 4.6, and Hold's server checks every argument. The model chooses when to call them,
// effort is set, and nothing is retried: the runner's ceilings bound the whole turn, and an unreachable model is an
// ordinary outcome the page explains.
export function createBedrockAssistantModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>): AssistantModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0 })
  return {
    simulated: false,
    async reply(request, signal) {
      try {
        const response = await client.beta.messages.create(
          {
            model: HOSTED_MODEL,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: request.messages.map((message) => ({ role: message.role, content: [...message.content] })),
            tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: { ...transformJSONSchema(tool.inputSchema), type: 'object' as const } })),
            tool_choice: { type: 'auto' },
            output_config: { effort: 'medium' },
          },
          { signal },
        )
        if (response.stop_reason === 'refusal') return { kind: 'refused', model: response.model }
        const content = response.content.flatMap((block): Block[] => {
          if (block.type === 'text') return [{ type: 'text', text: block.text }]
          if (block.type === 'tool_use') return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> }]
          return []
        })
        return { kind: 'reply', content, stopReason: response.stop_reason ?? 'end_turn', tokens: response.usage.input_tokens + response.usage.output_tokens, model: response.model }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: HOSTED_MODEL }
        throw error
      }
    },
  }
}
