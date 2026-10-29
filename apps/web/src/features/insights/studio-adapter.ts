import type { InsightsTurnResult } from '@hold/agent'
import type { AgAiEvent, AgLlmAdapter, AgLlmRequest, AgLlmResponse } from 'ag-studio'

// The insights dashboard's model adapter (extensions.md section 12.5). AG Studio's agent loop runs in the browser and
// asks for one model turn at a time; each goes to Hold's server function, which asks the model and gates every call it
// asks for. The whole answer comes back at once and is played to Studio as the events its chat panel draws. Studio
// reads the calls to carry out from the resolved answer, not from the events.

type Ask = (previous: unknown, data: FormData) => Promise<{ readonly ok: true; readonly value: Pick<InsightsTurnResult, 'response'> } | { readonly ok: false; readonly failure: string }>

function* events(response: AgLlmResponse): Generator<AgAiEvent> {
  for (const item of response.output) {
    if (item.type === 'message') {
      const text = item.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')
      if (text === '') continue
      yield { type: 'TEXT_MESSAGE_START', messageId: item.id, role: 'assistant' }
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId: item.id, delta: text }
      yield { type: 'TEXT_MESSAGE_END', messageId: item.id }
    } else if (item.type === 'function_call') {
      yield { type: 'TOOL_CALL_START', toolCallId: item.callId, toolCallName: item.name }
      yield { type: 'TOOL_CALL_ARGS', toolCallId: item.callId, delta: item.arguments }
      yield { type: 'TOOL_CALL_END', toolCallId: item.callId }
    }
  }
}

export function studioAdapter(ask: Ask): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest) {
      const answer = (async (): Promise<AgLlmResponse> => {
        const data = new FormData()
        data.set('turn', JSON.stringify({ input: request.input, instructions: request.instructions, tools: request.tools, toolChoice: request.toolChoice }))
        const result = await ask(null, data)
        if (!result.ok) throw new Error(`The insights agent's turn was refused: ${result.failure}.`)
        return result.value.response
      })()
      // Studio waits for the events to end before it reads the answer; a refusal is read there, not left unhandled.
      answer.catch(() => undefined)
      async function* stream(): AsyncGenerator<AgAiEvent> {
        try {
          yield* events(await answer)
        } catch {
          // The answer itself carries the failure to Studio.
        }
      }
      return { stream: stream(), complete: answer }
    },
  }
}
