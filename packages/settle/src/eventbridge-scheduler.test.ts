import { describe, expect, it } from 'vitest'
import { createEventBridgeScheduler } from './eventbridge-scheduler.ts'

type Sent = { readonly command: string; readonly input: unknown }

function client(failWith?: (command: string) => string | undefined) {
  const sent: Sent[] = []
  return {
    sent,
    send(command: { readonly constructor: { readonly name: string }; readonly input: unknown }) {
      const name = command.constructor.name
      sent.push({ command: name, input: command.input })
      const failure = failWith?.(name)
      if (failure === undefined) return Promise.resolve({})
      const error = new Error(failure)
      error.name = failure
      return Promise.reject(error)
    },
  }
}

const options = (stub: ReturnType<typeof client>) => ({ groupName: 'hold-schedules', roleArn: 'arn:aws:iam::1:role/hold-scheduler', queueArns: { upkeep: 'arn:aws:sqs:us-east-1:1:hold-upkeep.fifo' }, client: stub })
const message = { queue: 'upkeep', group: 'hold-1', deduplicationId: 'hold-expire-a', body: { shopId: 's', holdId: 'hold-1', authorizationId: 'a', kind: 'expire' } }
const WHEN = new Date('2026-11-14T09:30:15.250Z')

describe('scheduling with EventBridge Scheduler', () => {
  it('makes a one-off schedule in Hold’s group that sends the message to its queue, in its group, at the time in UTC', async () => {
    const stub = client()
    await createEventBridgeScheduler(options(stub)).at('hold-expire-a', WHEN, message)
    expect(stub.sent).toEqual([
      {
        command: 'CreateScheduleCommand',
        input: {
          Name: 'hold-expire-a',
          GroupName: 'hold-schedules',
          ScheduleExpression: 'at(2026-11-14T09:30:16)',
          ScheduleExpressionTimezone: 'UTC',
          FlexibleTimeWindow: { Mode: 'OFF' },
          ActionAfterCompletion: 'DELETE',
          Target: {
            Arn: 'arn:aws:sqs:us-east-1:1:hold-upkeep.fifo',
            RoleArn: 'arn:aws:iam::1:role/hold-scheduler',
            Input: JSON.stringify(message.body),
            SqsParameters: { MessageGroupId: 'hold-1' },
            RetryPolicy: { MaximumEventAgeInSeconds: 86_400, MaximumRetryAttempts: 185 },
          },
        },
      },
    ])
  })

  it('moves a schedule that already exists to the new time', async () => {
    const stub = client((command) => (command === 'CreateScheduleCommand' ? 'ConflictException' : undefined))
    await createEventBridgeScheduler(options(stub)).at('hold-expire-a', WHEN, message)
    expect(stub.sent.map((each) => each.command)).toEqual(['CreateScheduleCommand', 'UpdateScheduleCommand'])
    expect(stub.sent[1]?.input).toMatchObject({ Name: 'hold-expire-a', ScheduleExpression: 'at(2026-11-14T09:30:16)' })
  })

  it('refuses a queue it has no address for', async () => {
    await expect(createEventBridgeScheduler(options(client())).at('x', WHEN, { ...message, queue: 'media' })).rejects.toThrow(/media/)
  })

  it('removes a schedule, and counts one already gone as removed', async () => {
    const stub = client(() => 'ResourceNotFoundException')
    await createEventBridgeScheduler(options(stub)).remove('hold-expire-a')
    expect(stub.sent).toEqual([{ command: 'DeleteScheduleCommand', input: { Name: 'hold-expire-a', GroupName: 'hold-schedules' } }])
  })
})
