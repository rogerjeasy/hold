import type { PushMessage, PushSender } from './push.ts'

// One person's phones, as the database lists them: each with the ticket of the last push sent to it, whose receipt has
// not been read yet.
export type PushDevice = { readonly id: string; readonly token: string; readonly pendingTicket: string | null }

export type PushDelivery = {
  // The phones a push went to, each with its new ticket.
  readonly sent: readonly { readonly id: string; readonly ticket: string }[]
  // The phones Expo says are no longer registered (the app was removed, or notifications turned off for good).
  readonly gone: readonly string[]
}

// Receipts are ready some minutes after a push, so the last push's receipt is read just before the next one: a phone
// that is gone is dropped then, without a schedule of its own.
export async function deliverPushes<Device extends PushDevice>(sender: PushSender, devices: readonly Device[], words: (device: Device) => Omit<PushMessage, 'to'>): Promise<PushDelivery> {
  if (devices.length === 0) return { sent: [], gone: [] }
  const pending = devices.flatMap((device) => (device.pendingTicket === null ? [] : [device.pendingTicket]))
  const receipts = pending.length === 0 ? new Map<string, string>() : await sender.receipts(pending)
  const gone = devices.filter((device) => device.pendingTicket !== null && receipts.get(device.pendingTicket) === 'device_not_registered').map((device) => device.id)
  const live = devices.filter((device) => !gone.includes(device.id))
  const tickets = live.length === 0 ? [] : await sender.send(live.map((device) => ({ ...words(device), to: device.token })))
  const sent: { id: string; ticket: string }[] = []
  live.forEach((device, index) => {
    const ticket = tickets[index]
    if (ticket?.ok === true) sent.push({ id: device.id, ticket: ticket.ticket })
    else if (ticket?.reason === 'device_not_registered') gone.push(device.id)
  })
  return { sent, gone }
}
