import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import type { BedrockMantleClientOptions } from '@anthropic-ai/bedrock-sdk/mantle-client'
import { APIConnectionError, APIError, APIUserAbortError, BetaFallbackState, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk'
import type { Anthropic } from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { investigationSchema, OPS_MODEL, OPS_PROMPT } from './investigator.ts'
import type { Investigation, Investigator, InvestigationRequest } from './investigator.ts'

type Message = Anthropic.Beta.Messages.BetaMessageParam

const brief = (request: InvestigationRequest) => [
  `Exception: ${request.exceptionKind}`,
  `Allowed proposal kinds: ${request.allowed.join(', ')}`,
  `Deadline: ${request.deadline?.toISOString() ?? 'none'}`,
  `The owner's rules: ${request.rules.length === 0 ? 'none' : JSON.stringify(request.rules)}`,
  request.paypalAvailable ? 'PayPal read tools are available.' : 'PayPal cannot be reached in this run: say so, and set paypalConfirmed to false.',
  `The records, as quoted data:\n<facts>\n${request.facts}\n</facts>`,
].join('\n')

// Only this adapter reaches Bedrock for the operations agent. It runs the model's tool calls through the gated tools
// it is given and nothing else, up to the exception's limit, then reads the structured answer. PayPal's tool schemas
// are PayPal's, so they are passed as listed rather than in strict mode; the answer itself is a strict schema.
export function createBedrockInvestigator(options: BedrockMantleClientOptions): Investigator {
  const client = new AnthropicBedrockMantle({ ...options, maxRetries: 1, middleware: [betaRefusalFallbackMiddleware([{ model: 'anthropic.claude-opus-4-8' }])] })
  return {
    async investigate(request, tools, limits): Promise<Investigation> {
      const definitions = tools.tools.map((tool) => ({ name: tool.name, description: tool.description.slice(0, 1000), input_schema: { type: 'object' as const, ...tool.inputSchema } }))
      const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: brief(request) }] }]
      let calls = 0
      let inputTokens = 0
      let outputTokens = 0
      let model = OPS_MODEL
      try {
        for (let turn = 0; turn <= limits.toolCalls + 1; turn += 1) {
          const response = await client.beta.messages.create({
            model: OPS_MODEL,
            max_tokens: 4000,
            system: OPS_PROMPT,
            messages,
            ...(definitions.length === 0 ? {} : { tools: definitions, tool_choice: { type: 'auto' as const } }),
            output_config: { effort: 'medium', format: betaZodOutputFormat(investigationSchema) },
          }, { signal: limits.signal, fallbackState: new BetaFallbackState() })
          inputTokens += response.usage.input_tokens
          outputTokens += response.usage.output_tokens
          model = response.model
          if (response.stop_reason === 'tool_use') {
            const results = []
            for (const block of response.content) {
              if (block.type !== 'tool_use') continue
              calls += 1
              const input = typeof block.input === 'object' && block.input !== null ? block.input as Readonly<Record<string, unknown>> : {}
              const text = calls > limits.toolCalls ? 'Refused: the tool call limit for this exception is reached. Answer now.' : await tools.call(block.name, input)
              results.push({ type: 'tool_result' as const, tool_use_id: block.id, content: text })
            }
            messages.push({ role: 'assistant', content: response.content }, { role: 'user', content: results })
            continue
          }
          if (response.stop_reason !== 'end_turn') return { kind: response.stop_reason === 'refusal' ? 'refused' : 'unavailable', model, inputTokens, outputTokens }
          const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
          try { return { kind: 'result', data: JSON.parse(text) as unknown, model, inputTokens, outputTokens } } catch { return { kind: 'unavailable', model, inputTokens, outputTokens } }
        }
        return { kind: 'unavailable', model, inputTokens, outputTokens }
      } catch (error) {
        if (error instanceof APIError || error instanceof APIConnectionError || error instanceof APIUserAbortError) return { kind: 'unavailable', model, inputTokens, outputTokens }
        throw error
      }
    },
  }
}
