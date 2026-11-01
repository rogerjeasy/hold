// Push notifications to Hold's phone app (architecture.md section 13.9), through a port so the web app and the worker
// never call Expo directly. A push carries a short title and body and the data the app routes the tap with; what may
// be in them is decided in push-notices.ts.

export type PushMessage = {
  // The phone's Expo push token.
  readonly to: string
  readonly title: string
  readonly body: string
  readonly data: Readonly<Record<string, string>>
}

// A ticket is Expo's promise to deliver; its receipt, read later, says whether it did. A device that is gone is told
// apart, so Hold stops sending to it.
export type PushTicket = { readonly ok: true; readonly ticket: string } | { readonly ok: false; readonly reason: 'device_not_registered' | 'unavailable' }
export type PushReceipt = 'delivered' | 'device_not_registered' | 'unknown'

export type PushSender = {
  // One ticket per message, in the order sent. Never throws.
  send(messages: readonly PushMessage[]): Promise<readonly PushTicket[]>
  // What became of earlier tickets. One not ready, or forgotten, reads as unknown. Never throws.
  receipts(tickets: readonly string[]): Promise<ReadonlyMap<string, PushReceipt>>
}

// For tests and for a developer's machine: keeps what was sent. Tokens in `gone` are no longer registered, and so are
// the tickets in `goneTickets` when their receipt is read.
export function createMemoryPushSender(options: { readonly gone?: readonly string[]; readonly goneTickets?: readonly string[] } = {}): PushSender & { readonly sent: readonly PushMessage[] } {
  const sent: PushMessage[] = []
  return {
    sent,
    send(messages) {
      return Promise.resolve(messages.map((message): PushTicket => {
        sent.push(message)
        return options.gone?.includes(message.to) === true ? { ok: false, reason: 'device_not_registered' } : { ok: true, ticket: `memory-${String(sent.length)}` }
      }))
    },
    receipts(tickets) {
      return Promise.resolve(new Map(tickets.map((ticket): [string, PushReceipt] => [ticket, options.goneTickets?.includes(ticket) === true ? 'device_not_registered' : 'unknown'])))
    },
  }
}
