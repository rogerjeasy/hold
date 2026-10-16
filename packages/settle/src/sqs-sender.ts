import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { QueueMessage } from './dependencies.ts'

type Client = { send: (command: SendMessageCommand) => Promise<unknown> }

// Sends queue messages to SQS. Hold's queues that keep order are FIFO: the group keeps one rental's work in order, and
// the deduplication id makes a message sent twice within five minutes arrive once. Work done once whatever, such as a
// display copy, goes to a standard queue.
export function createSqsSender(options: { readonly queues: Readonly<Record<string, string>>; readonly region?: string; readonly client?: Client }): (message: QueueMessage) => Promise<void> {
  const client = options.client ?? new SQSClient({ region: options.region })
  return async (message) => {
    const url = options.queues[message.queue]
    if (url === undefined) throw new Error(`No address for the queue ${message.queue}.`)
    // A standard queue, such as media, keeps no order and takes no group or deduplication id.
    const ordered = url.endsWith('.fifo') ? { MessageGroupId: message.group, MessageDeduplicationId: message.deduplicationId } : {}
    await client.send(new SendMessageCommand({ QueueUrl: url, ...ordered, MessageBody: JSON.stringify(message.body) }))
  }
}
