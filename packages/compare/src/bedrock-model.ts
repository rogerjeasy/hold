import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { INSPECTION_LIMITS } from '@hold/domain'
import { COMPARISON_MODEL, FIRST_PROMPT, lookSchema, SECOND_PROMPT } from './model.ts'
import type { ComparisonModel } from './model.ts'

// Only this adapter reaches Bedrock. No tool is offered; text read from photographs can never cause an action.
export function createBedrockComparisonModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>): ComparisonModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0, timeout: INSPECTION_LIMITS.maxMillisecondsPerCall })
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
        }, { signal })
        if (response.stop_reason !== 'end_turn') return { kind: response.stop_reason === 'refusal' ? 'refused' : 'unavailable', model: response.model }
        const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
        let data: unknown
        try { data = JSON.parse(text) as unknown } catch { return { kind: 'unavailable', model: response.model } }
        return { kind: 'result', data, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      } catch (error) {
        // Throttled: Bedrock refused for capacity (429), such as the account's daily tokens being spent. The pipeline defers
        // it like any failed look; an evaluation stops on it, since it says nothing about the photographs.
        if (error instanceof APIError && error.status === 429) return { kind: 'throttled', model: COMPARISON_MODEL }
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: COMPARISON_MODEL }
        throw error
      }
    },
  }
}
