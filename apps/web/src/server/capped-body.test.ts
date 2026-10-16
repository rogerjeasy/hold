import { describe, expect, it } from 'vitest'
import { readCappedBody } from './capped-body'

const encoder = new TextEncoder()

// A sender that never stops, counting what was read from it.
function endless(chunk: string) {
  let read = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      read += chunk.length
      controller.enqueue(encoder.encode(chunk))
    },
  })
  return { request: new Request('https://hold.test/api/webhooks/paypal/a', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), read: () => read }
}

describe('reading a capped body', () => {
  it('returns the text of a body within the limit', async () => {
    expect(await readCappedBody(new Request('https://hold.test/x', { method: 'POST', body: '{"id":"WH-1"}' }), 64)).toEqual({ ok: true, text: '{"id":"WH-1"}' })
  })

  it('refuses a body over the limit and stops reading it, so a flood is never held in memory', async () => {
    const sender = endless('x'.repeat(1024))
    expect(await readCappedBody(sender.request, 4096)).toEqual({ ok: false })
    expect(sender.read()).toBeLessThanOrEqual(4096 + 2 * 1024)
  })

  it('refuses at once a body whose stated length is over the limit', async () => {
    const request = new Request('https://hold.test/x', { method: 'POST', body: 'small', headers: { 'content-length': '999999' } })
    expect(await readCappedBody(request, 64)).toEqual({ ok: false })
  })
})
