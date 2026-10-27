// Where a rental's assistant stands, for its heading: connected with a token, disconnected by the renter, or one that
// made the booking and has no token yet.
export type AssistantState = 'connected' | 'disconnected' | 'booked'

export function assistantState(assistant: { readonly connected: boolean; readonly revoked: boolean }): AssistantState {
  if (assistant.revoked) return 'disconnected'
  return assistant.connected ? 'connected' : 'booked'
}
