import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { CONTEST_SUMMARY_LIMITS } from '@hold/domain'
import { CONTEST_MODEL, CONTEST_PROMPT, contestSummarySchema } from './contest-model.ts'
import type { ContestModel } from './contest-model.ts'

// Only this adapter reaches Bedrock to summarize a contest. One request, no tools, no retries, an output ceiling and a
// timeout: the contest is already recorded, and anything but an answer leaves the code-built layout on its own.
export function createBedrockContestModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>): ContestModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0, timeout: CONTEST_SUMMARY_LIMITS.maxMilliseconds })
  return {
    async summarize(request, signal) {
      try {
        const response = await client.beta.messages.create({
          model: CONTEST_MODEL,
          max_tokens: CONTEST_SUMMARY_LIMITS.maxTokens,
          output_config: { effort: 'medium', format: betaZodOutputFormat(contestSummarySchema) },
          system: CONTEST_PROMPT,
          messages: [{ role: 'user', content: [{ type: 'text', text: `The contested claim, as quoted data:\n${request.quoted}` }] }],
        }, { signal })
        if (response.stop_reason !== 'end_turn') return { kind: response.stop_reason === 'refusal' ? 'refused' : 'unavailable', model: response.model }
        const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
        let data: unknown
        try { data = JSON.parse(text) as unknown } catch { return { kind: 'unavailable', model: response.model } }
        return { kind: 'result', data, model: response.model }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: CONTEST_MODEL }
        throw error
      }
    },
  }
}
