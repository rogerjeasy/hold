import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import type { BedrockMantleClientOptions } from '@anthropic-ai/bedrock-sdk/mantle-client'
import { APIConnectionError, APIError, APIUserAbortError, BetaFallbackState, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { INSPECTION_LIMITS } from '@hold/domain'
import { COMPARISON_MODEL, FIRST_PROMPT, lookSchema, SECOND_PROMPT } from './model.ts'
import type { ComparisonModel } from './model.ts'

// Only this adapter reaches Bedrock. No tool is offered; text read from photographs can never cause an action.
export function createBedrockComparisonModel(options: BedrockMantleClientOptions): ComparisonModel {
  const client = new AnthropicBedrockMantle({ ...options, maxRetries: 0, timeout: 30_000, middleware: [betaRefusalFallbackMiddleware([{ model: 'anthropic.claude-opus-4-8' }])] })
  return {
    async look(request, signal) {
      try {
        const response = await client.beta.messages.create({
          model: COMPARISON_MODEL,
          max_tokens: INSPECTION_LIMITS.maxTokensPerCall,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high', format: betaZodOutputFormat(lookSchema) },
          system: request.kind === 'first' ? FIRST_PROMPT : SECOND_PROMPT,
          messages: [{ role: 'user', content: [
            { type: 'text', text: request.context || 'Compare the two crops independently.' },
            ...request.images.flatMap(({ label, body }) => [
              { type: 'text' as const, text: label },
              { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: body.toString('base64') } },
            ]),
          ] }],
        }, { signal, fallbackState: new BetaFallbackState() })
        if (response.stop_reason !== 'end_turn') return { kind: response.stop_reason === 'refusal' ? 'refused' : 'unavailable', model: response.model }
        const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
        let data: unknown
        try { data = JSON.parse(text) as unknown } catch { return { kind: 'unavailable', model: response.model } }
        return { kind: 'result', data, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: COMPARISON_MODEL }
        throw error
      }
    },
  }
}
