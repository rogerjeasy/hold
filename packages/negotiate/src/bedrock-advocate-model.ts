import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import type { BedrockMantleClientOptions } from '@anthropic-ai/bedrock-sdk/mantle-client'
import { APIConnectionError, APIError, APIUserAbortError, BetaFallbackState, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk'
import { ADVOCATE_TOOLS } from './advocate-model.ts'
import type { AdvocateModel } from './advocate-model.ts'
import { ADVOCATE_MODEL } from './prompts.ts'

const TOOL_NAMES = ['offer', 'accept', 'pass'] as const
const isTool = (name: string): name is (typeof TOOL_NAMES)[number] => (TOOL_NAMES as readonly string[]).includes(name)

// Only this adapter reaches Bedrock for an advocate. One request per turn, no retries inside it, a small output ceiling,
// the three moves as strict tools with automatic choice, and a refusal handled as a normal outcome.
export function createBedrockAdvocateModel(options: BedrockMantleClientOptions, timeoutMilliseconds = 60_000): AdvocateModel {
  const client = new AnthropicBedrockMantle({ ...options, maxRetries: 0, timeout: timeoutMilliseconds, middleware: [betaRefusalFallbackMiddleware([{ model: 'anthropic.claude-opus-4-8' }])] })
  return {
    async move(request, signal) {
      try {
        const response = await client.beta.messages.create({
          model: ADVOCATE_MODEL,
          max_tokens: 4096,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          tools: ADVOCATE_TOOLS.map((tool) => ({ ...tool, input_schema: { ...tool.input_schema } })),
          tool_choice: { type: 'auto' },
          system: request.system,
          messages: [{ role: 'user', content: [{ type: 'text', text: request.message }] }],
        }, { signal, fallbackState: new BetaFallbackState() })
        const usage = { model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        if (response.stop_reason === 'refusal') return { kind: 'refused', ...usage }
        const call = response.content.find((block) => block.type === 'tool_use')
        if (response.stop_reason !== 'tool_use' || call?.type !== 'tool_use' || !isTool(call.name)) return { kind: 'no_move', ...usage }
        return { kind: 'move', tool: call.name, input: call.input, ...usage }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: ADVOCATE_MODEL, inputTokens: 0, outputTokens: 0 }
        throw error
      }
    },
  }
}
