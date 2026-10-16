import { describe, expect, it } from 'vitest'
import { createSqsSender } from './sqs-sender.ts'

describe('sending to SQS', () => {
  it('sends the message to its queue, in its group, deduplicated by what it names', async () => {
    const sent: unknown[] = []
    const send = createSqsSender({ queues: { executions: 'https://sqs.test/hold-executions.fifo' }, client: { send: (command) => Promise.resolve(void sent.push(command.input)) } })
    await send({ queue: 'executions', group: 'rental-1', deduplicationId: 'execution-1', body: { shopId: 'shop-1', executionId: '1' } })
    expect(sent).toEqual([{ QueueUrl: 'https://sqs.test/hold-executions.fifo', MessageGroupId: 'rental-1', MessageDeduplicationId: 'execution-1', MessageBody: '{"shopId":"shop-1","executionId":"1"}' }])
  })

  it('refuses a queue it has no address for, so the message stays in the outbox', async () => {
    const send = createSqsSender({ queues: {}, client: { send: () => Promise.resolve(undefined) } })
    await expect(send({ queue: 'media', group: 'g', deduplicationId: 'd', body: {} })).rejects.toThrow(/media/)
  })
})
