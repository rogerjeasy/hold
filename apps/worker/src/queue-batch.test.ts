import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'

const execution = z.object({ shopId: z.string().min(1), executionId: z.string().min(1) })
const event = z.object({ shopId: z.string().min(1), eventId: z.string().min(1) })
const record = (messageId: string, body: unknown) => ({ messageId, body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('a queue handler', () => {
  it('handles each message with its shop and names only the ones that failed, so SQS tries those again', async () => {
    const handled: unknown[] = []
    const handler = createQueueHandler({ schema: execution, handle: (message) => (message.executionId === 'bad' ? Promise.reject(new Error('PayPal is unavailable')) : Promise.resolve(void handled.push(message))) })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const answer = await handler({ Records: [record('1', { shopId: 's', executionId: 'good' }), record('2', { shopId: 's', executionId: 'bad' })] })
    expect(handled).toEqual([{ shopId: 's', executionId: 'good' }])
    expect(answer).toEqual({ batchItemFailures: [{ itemIdentifier: '2' }] })
  })

  it('drops a message that is not one of Hold’s, instead of retrying it for ever', async () => {
    const handle = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const answer = await createQueueHandler({ schema: event, handle })({ Records: [record('1', 'not json'), record('2', { shopId: 's' })] })
    expect(handle).not.toHaveBeenCalled()
    expect(answer).toEqual({ batchItemFailures: [] })
  })

  it('logs which message failed with the error’s name, its query and its stack, never its text or the values', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = Object.assign(new Error('Failed query: select hold_renter_for_payer($1, $2)\nparams: PAYER1,renter@example.com'), { name: 'DrizzleQueryError', query: 'select hold_renter_for_payer($1, $2)', params: ['PAYER1', 'renter@example.com'] })
    const answer = await createQueueHandler({ schema: event, handle: () => Promise.reject(failing) })({ Records: [record('7', { shopId: 's', eventId: 'e' })] })
    expect(answer).toEqual({ batchItemFailures: [{ itemIdentifier: '7' }] })
    const lines = logged.mock.calls.flat().join(' ')
    expect(lines).toContain('Message 7 failed and will be tried again: DrizzleQueryError query="select hold_renter_for_payer($1, $2)"')
    expect(lines).toMatch(/\n\s+at /)
    expect(lines).not.toContain('renter@example.com')
    expect(lines).not.toContain('PAYER1')
  })

  it('hands the work every field its schema names', async () => {
    const upkeep = z.object({ shopId: z.string(), holdId: z.string(), authorizationId: z.string(), kind: z.enum(['replace', 'expire']) })
    const handled: unknown[] = []
    await createQueueHandler({ schema: upkeep, handle: (message) => Promise.resolve(void handled.push(message)) })({ Records: [record('1', { shopId: 's', holdId: 'h', authorizationId: 'a', kind: 'expire' })] })
    expect(handled).toEqual([{ shopId: 's', holdId: 'h', authorizationId: 'a', kind: 'expire' }])
  })
})

