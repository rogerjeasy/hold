import { CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient, UpdateScheduleCommand } from '@aws-sdk/client-scheduler'
import type { CreateScheduleCommandInput } from '@aws-sdk/client-scheduler'
import type { Scheduler } from './dependencies.ts'

type Command = CreateScheduleCommand | UpdateScheduleCommand | DeleteScheduleCommand
type Client = { send: (command: Command) => Promise<unknown> }

export type EventBridgeSchedulerOptions = {
  readonly groupName: string
  // The role EventBridge Scheduler takes to send to Hold's queues.
  readonly roleArn: string
  readonly queueArns: Readonly<Record<string, string>>
  readonly region?: string
  readonly client?: Client
}

const named = (error: unknown, name: string) => error instanceof Error && error.name === name

// A one-off time, to the second. Rounded up, so a schedule never fires before its time.
function atExpression(when: Date): string {
  return `at(${new Date(Math.ceil(when.getTime() / 1000) * 1000).toISOString().slice(0, 19)})`
}

// Hold's schedules in EventBridge Scheduler (architecture.md section 14.7), each in Hold's group, firing once and
// deleted after. A schedule sends its message to an SQS FIFO queue in its group; the queue deduplicates by content,
// since Scheduler cannot pass a deduplication id.
export function createEventBridgeScheduler(options: EventBridgeSchedulerOptions): Scheduler {
  const client = options.client ?? new SchedulerClient({ region: options.region })
  return {
    async at(name, when, message) {
      const arn = options.queueArns[message.queue]
      if (arn === undefined) throw new Error(`No address for the queue ${message.queue}.`)
      const input: CreateScheduleCommandInput = {
        Name: name,
        GroupName: options.groupName,
        ScheduleExpression: atExpression(when),
        ScheduleExpressionTimezone: 'UTC',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ActionAfterCompletion: 'DELETE',
        Target: {
          Arn: arn,
          RoleArn: options.roleArn,
          Input: JSON.stringify(message.body),
          SqsParameters: { MessageGroupId: message.group },
          // Keep trying for a day if the queue cannot take it.
          RetryPolicy: { MaximumEventAgeInSeconds: 86_400, MaximumRetryAttempts: 185 },
        },
      }
      try {
        await client.send(new CreateScheduleCommand(input))
      } catch (error) {
        if (!named(error, 'ConflictException')) throw error
        await client.send(new UpdateScheduleCommand(input))
      }
    },
    async remove(name) {
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: options.groupName }))
      } catch (error) {
        if (!named(error, 'ResourceNotFoundException')) throw error
      }
    },
  }
}
