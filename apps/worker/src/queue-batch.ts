import { z } from 'zod'

// An SQS batch as Lambda delivers it, and the answer that names the messages to try again.
export type QueueEvent = { readonly Records: readonly { readonly messageId: string; readonly body: string }[] }
export type QueueAnswer = { readonly batchItemFailures: readonly { readonly itemIdentifier: string }[] }

type Message<Field extends string> = { readonly shopId: string } & Record<Field, string>

// Handles each message of a batch for the shop it names. A message whose work throws, such as while PayPal cannot be
// reached, is named in the answer, so SQS tries it again and, after the last try, moves it to its dead-letter queue.
// A message that is not one of Hold's is dropped: trying it again would never help.
export function createQueueHandler<Field extends string>(options: { readonly field: Field; readonly handle: (message: Message<Field>) => Promise<unknown> }) {
  const schema = z.object({ shopId: z.string().min(1), [options.field]: z.string().min(1) })
  return async (event: QueueEvent): Promise<QueueAnswer> => {
    const failures: { itemIdentifier: string }[] = []
    for (const record of event.Records) {
      let message: Message<Field>
      try {
        message = schema.parse(JSON.parse(record.body)) as Message<Field>
      } catch {
        console.error(`Dropped message ${record.messageId}: not a Hold message.`)
        continue
      }
      try {
        await options.handle(message)
      } catch (error) {
        // Only the kind of error: a failed query's text carries its values, which can be a renter's details.
        console.error(`Message ${record.messageId} failed and will be tried again: ${error instanceof Error ? error.name : 'unknown error'}`)
        failures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures: failures }
  }
}
