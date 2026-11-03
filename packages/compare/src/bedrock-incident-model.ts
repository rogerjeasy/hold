import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import type { ClientOptions } from '@anthropic-ai/bedrock-sdk'
import { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { AGENT_MODEL_BETAS, INCIDENT_LIMITS } from '@hold/domain'
import { INCIDENT_MODEL, INCIDENT_PROMPT, incidentSortSchema } from './incident-model.ts'
import type { IncidentModel } from './incident-model.ts'

// Only this adapter reaches Bedrock to sort an incident. One request, no tools, no retries, a small output ceiling and
// a short timeout: the report is already stored, and anything but an answer sends it to a person.
export function createBedrockIncidentModel(options: Pick<ClientOptions, 'awsRegion' | 'skipAuth' | 'fetch'>): IncidentModel {
  const client = new AnthropicBedrock({ ...options, maxRetries: 0, timeout: INCIDENT_LIMITS.maxMilliseconds })
  return {
    async sort(request, signal) {
      try {
        const response = await client.beta.messages.create({
          model: INCIDENT_MODEL,
          betas: AGENT_MODEL_BETAS,
          max_tokens: INCIDENT_LIMITS.maxTokens,
          output_config: { effort: 'medium', format: betaZodOutputFormat(incidentSortSchema) },
          system: INCIDENT_PROMPT,
          messages: [{ role: 'user', content: [{ type: 'text', text: `The report, as quoted data:\n${request.quoted}` }] }],
        }, { signal })
        if (response.stop_reason !== 'end_turn') return { kind: response.stop_reason === 'refusal' ? 'refused' : 'unavailable', model: response.model }
        const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
        let data: unknown
        try { data = JSON.parse(text) as unknown } catch { return { kind: 'unavailable', model: response.model } }
        return { kind: 'result', data, model: response.model }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model: INCIDENT_MODEL }
        throw error
      }
    },
  }
}
