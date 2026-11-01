import { describe, expect, it, vi } from 'vitest'
import { deliverPushes } from './push-delivery.ts'
import { createMemoryPushSender } from './push.ts'
import type { PushSender } from './push.ts'

const words = (device: { readonly id: string }) => ({ title: 'Ribeira Bikes', body: 'Your receipt is ready.', data: { kind: 'renter', reference: `ref-${device.id}`, page: 'record' } })

describe('delivering a push to a person’s phones', () => {
  it('sends each phone its message and keeps the ticket, so its receipt can be read later', async () => {
    const sender = createMemoryPushSender()
    const delivered = await deliverPushes(sender, [{ id: 'd-1', token: 'ExponentPushToken[one]', pendingTicket: null }, { id: 'd-2', token: 'ExponentPushToken[two]', pendingTicket: null }], words)
    expect(sender.sent.map((message) => [message.to, message.data['reference']])).toEqual([['ExponentPushToken[one]', 'ref-d-1'], ['ExponentPushToken[two]', 'ref-d-2']])
    expect(delivered).toEqual({ sent: [{ id: 'd-1', ticket: 'memory-1' }, { id: 'd-2', ticket: 'memory-2' }], gone: [] })
  })

  it('stops at a phone Expo says is no longer registered, whether it says so at once or in the last receipt', async () => {
    const sender = createMemoryPushSender({ gone: ['ExponentPushToken[gone]'], goneTickets: ['ticket-of-uninstalled'] })
    const delivered = await deliverPushes(sender, [
      { id: 'd-1', token: 'ExponentPushToken[gone]', pendingTicket: null },
      { id: 'd-2', token: 'ExponentPushToken[uninstalled]', pendingTicket: 'ticket-of-uninstalled' },
      { id: 'd-3', token: 'ExponentPushToken[fine]', pendingTicket: 'ticket-delivered' },
    ], words)
    expect([...delivered.gone].sort()).toEqual(['d-1', 'd-2'])
    expect(sender.sent.map((message) => message.to)).toEqual(['ExponentPushToken[gone]', 'ExponentPushToken[fine]'])
    expect(delivered.sent).toEqual([{ id: 'd-3', ticket: expect.any(String) as unknown }])
  })

  it('sends nothing, and asks nothing, with no phones', async () => {
    const send = vi.fn<PushSender['send']>()
    const receipts = vi.fn<PushSender['receipts']>()
    expect(await deliverPushes({ send, receipts }, [], words)).toEqual({ sent: [], gone: [] })
    expect(send).not.toHaveBeenCalled()
    expect(receipts).not.toHaveBeenCalled()
  })

  it('keeps a phone whose push failed for another reason, with no ticket, to try with the next message', async () => {
    const sender: PushSender = { send: () => Promise.resolve([{ ok: false, reason: 'unavailable' }]), receipts: () => Promise.resolve(new Map()) }
    expect(await deliverPushes(sender, [{ id: 'd-1', token: 'ExponentPushToken[one]', pendingTicket: null }], words)).toEqual({ sent: [], gone: [] })
  })
})
