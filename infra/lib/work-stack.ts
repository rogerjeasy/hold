import { CfnOutput, Duration, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import type * as cognito from 'aws-cdk-lib/aws-cognito'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as s3 from 'aws-cdk-lib/aws-s3'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type * as sns from 'aws-cdk-lib/aws-sns'
import { createAlarmTopic, createMonthlyBudget, reportTo } from './alarms.ts'
import { name } from './settings.ts'
import { createWorker } from './worker.ts'
import { createComparisonWorker } from './comparison-worker.ts'
import { createDemoCleanup } from './demo-cleanup.ts'
import { createNegotiationWorker } from './negotiation-worker.ts'
import { createEvidenceWorkers } from './evidence-worker.ts'
import { createOperationsWorker } from './ops-worker.ts'
import { createTextReports } from './texts.ts'
import type { TextSettings } from './texts.ts'

// Background work (architecture.md section 14.7): the spine's queues, each with a dead-letter queue and an alarm on
// it, and the group the worker's schedules live in. The extensions add their queues when they arrive. The topic every
// alarm reports to, and the account's budget, live here too (architecture.md section 17.1).

type QueueSpec = {
  readonly name: string
  // FIFO keeps work for one rental in order, using the rental as the message group.
  readonly orderedPerRental: boolean
  readonly visibilityTimeout: Duration
  // For a queue EventBridge Scheduler sends to: it cannot name a deduplication ID, so the content is the ID.
  readonly deduplicatedByContent?: boolean
}

export const QUEUES: readonly QueueSpec[] = [
  // Longer than the worker may run on one message (worker.ts), so two functions never handle it at once.
  { name: 'paypal-events', orderedPerRental: true, visibilityTimeout: Duration.minutes(6) },
  { name: 'executions', orderedPerRental: true, visibilityTimeout: Duration.minutes(6) },
  // A hold's timed upkeep, sent by its schedules (architecture.md section 7.4), in order per hold.
  { name: 'upkeep', orderedPerRental: true, visibilityTimeout: Duration.minutes(6), deduplicatedByContent: true },
  { name: 'comparisons', orderedPerRental: false, visibilityTimeout: Duration.minutes(10) },
  { name: 'media', orderedPerRental: false, visibilityTimeout: Duration.minutes(5) },
  { name: 'evidence', orderedPerRental: true, visibilityTimeout: Duration.minutes(5) },
  { name: 'messages', orderedPerRental: false, visibilityTimeout: Duration.minutes(6) },
  // One operations run per message, in order per shop (the shop is the message group).
  { name: 'ops-agent', orderedPerRental: true, visibilityTimeout: Duration.minutes(6) },
  // What a person approved on the morning queue that the operations worker sends: a message or a dispute answer.
  { name: 'ops-execute', orderedPerRental: true, visibilityTimeout: Duration.minutes(6) },
  // The advocates' turns on a contested claim (extensions.md section 9), one negotiation at a time per rental. Longer
  // than the negotiation worker may run (negotiation-worker.ts).
  { name: 'negotiations', orderedPerRental: true, visibilityTimeout: Duration.minutes(12) },
  // Delivery reports of renters' texts (texts.ts), fed by SNS once reports are on.
  { name: 'text-reports', orderedPerRental: false, visibilityTimeout: Duration.minutes(6) },
]

// After this many failed attempts a message moves to its dead-letter queue, where the alarm sees it.
const MAX_ATTEMPTS = 5

// The queues that move money: PayPal's events, approved captures and releases, and a hold's timed upkeep.
export const MONEY_QUEUES = ['paypal-events', 'executions', 'upkeep'] as const
// A message tried twice has waited two six-minute visibility timeouts. Fifteen minutes means money work is stuck, and
// tells a person well before the fifth try, about half an hour in, sets the message aside.
const MONEY_WAIT = Duration.minutes(15)

export type WorkResources = {
  readonly stack: Stack
  readonly queues: ReadonlyMap<string, sqs.Queue>
  readonly scheduleGroup: scheduler.ScheduleGroup
  readonly schedulerRole: iam.Role
  readonly alarmTopic: sns.Topic
}

function createQueue(stack: Stack, spec: QueueSpec, alarmTopic: sns.ITopic): sqs.Queue {
  const suffix = spec.orderedPerRental ? '.fifo' : ''
  const fifo = spec.orderedPerRental ? { fifo: true } : {}
  const deadLetterQueue = new sqs.Queue(stack, `${spec.name}-dead-letter`, {
    queueName: `${name(spec.name, 'dead-letter')}${suffix}`,
    ...fifo,
    retentionPeriod: Duration.days(14),
    encryption: sqs.QueueEncryption.SQS_MANAGED,
    enforceSSL: true,
  })
  const deadLettered = new cloudwatch.Alarm(stack, `${spec.name}-dead-letter-alarm`, {
    alarmName: name(spec.name, 'dead-letter'),
    alarmDescription: `A message on ${spec.name} failed ${String(MAX_ATTEMPTS)} times and was set aside.`,
    metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
    threshold: 0,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  })
  reportTo(alarmTopic, deadLettered)
  const queue = new sqs.Queue(stack, spec.name, {
    queueName: `${name(spec.name)}${suffix}`,
    ...(spec.orderedPerRental
      ? {
          fifo: true,
          // Each message Hold sends carries its own deduplication ID: the execution's, PayPal's event ID, or the
          // schedule's name. A message a schedule sends has none, so the upkeep queue takes its content instead.
          contentBasedDeduplication: spec.deduplicatedByContent === true,
          deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
          fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
        }
      : {}),
    visibilityTimeout: spec.visibilityTimeout,
    retentionPeriod: Duration.days(4),
    deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: MAX_ATTEMPTS },
    encryption: sqs.QueueEncryption.SQS_MANAGED,
    enforceSSL: true,
  })
  if ((MONEY_QUEUES as readonly string[]).includes(spec.name)) {
    reportTo(
      alarmTopic,
      new cloudwatch.Alarm(stack, `${spec.name}-waiting-alarm`, {
        alarmName: name(spec.name, 'waiting'),
        alarmDescription: `Money work on ${spec.name} has waited more than ${String(MONEY_WAIT.toMinutes())} minutes: its worker is failing or not running.`,
        metric: queue.metricApproximateAgeOfOldestMessage({ period: Duration.minutes(5), statistic: cloudwatch.Stats.MAXIMUM }),
        threshold: MONEY_WAIT.toSeconds(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        // SQS stops reporting on a queue that has been empty for hours, which is no fault.
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    )
  }
  return queue
}

export type WorkStackProps = StackProps & {
  readonly cluster: rds.IDatabaseCluster
  readonly workerUserSecret: secretsmanager.ISecret
  readonly renterLinkKey: secretsmanager.ISecret
  readonly publicUrl: string
  readonly evidenceBucket: s3.IBucket
  readonly displayBucket: s3.IBucket
  readonly texts: TextSettings
  // The address alarms and the budget email, from the deploy. Without one, nobody is subscribed.
  readonly alarmEmail: string | undefined
  readonly monthlyBudgetUsd: number
  // Only the demo cleanup reaches it, to remove a retired demo's users.
  readonly userPool: cognito.IUserPool
}

export function createWorkStack(app: App, props: WorkStackProps): WorkResources {
  const stack = new Stack(app, 'HoldWork', { ...props, description: 'Hold: queues, schedules and the worker' })
  const alarmTopic = createAlarmTopic(stack, props.alarmEmail)
  createMonthlyBudget(stack, alarmTopic, props.monthlyBudgetUsd)
  const queues = new Map(QUEUES.map((spec) => [spec.name, createQueue(stack, spec, alarmTopic)]))

  // Schedules for each hold are made and removed by the worker at run time (section 14.7), in this group only.
  const scheduleGroup = new scheduler.ScheduleGroup(stack, 'ScheduleGroup', { scheduleGroupName: name('schedules') })
  const schedulerRole = new iam.Role(stack, 'SchedulerRole', {
    roleName: name('scheduler'),
    // Kept as first deployed: the pipeline may not change a role's description. The role also starts the outbox relay.
    description: 'Assumed by EventBridge Scheduler to deliver Hold schedules to Hold queues, and nothing else.',
    assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
      conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
    }),
  })
  for (const queue of queues.values()) queue.grantSendMessages(schedulerRole)

  const workerProps = { cluster: props.cluster, workerUserSecret: props.workerUserSecret, queues, scheduleGroup, schedulerRole, publicUrl: props.publicUrl, renterLinkKey: props.renterLinkKey, evidenceBucket: props.evidenceBucket, displayBucket: props.displayBucket, texts: props.texts }
  const { relay } = createWorker(stack, workerProps)
  // Every request that writes to the outbox also sends at once; the relay catches what that missed. A relay that fails,
  // or no longer runs, leaves money work unsent with nothing else to notice it. Lambda reports its errors for every
  // period it runs, as zero when none failed, so a period with no report means the relay did not run at all.
  reportTo(
    alarmTopic,
    new cloudwatch.Alarm(stack, 'OutboxRelayAlarm', {
      alarmName: name('outbox', 'relay', 'failing'),
      alarmDescription: 'The outbox relay has failed, or not run, for fifteen minutes: money work waits unsent.',
      metric: relay.metricErrors({ period: Duration.minutes(5), statistic: cloudwatch.Stats.SUM }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      // Three periods in a row, so a database resuming from a pause, which a run waits out, is not a fault.
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    }),
  )
  createComparisonWorker(stack, workerProps)
  createNegotiationWorker(stack, workerProps)
  createEvidenceWorkers(stack, workerProps)
  createOperationsWorker(stack, workerProps)
  createDemoCleanup(stack, { ...workerProps, userPool: props.userPool })
  if (props.texts.reports) createTextReports(stack, workerProps)

  for (const [queueName, queue] of queues) {
    new CfnOutput(stack, `QueueUrl-${queueName}`, { value: queue.queueUrl })
  }
  new CfnOutput(stack, 'ScheduleGroupName', { value: scheduleGroup.scheduleGroupName })
  new CfnOutput(stack, 'SchedulerRoleArn', { value: schedulerRole.roleArn })

  return { stack, queues, scheduleGroup, schedulerRole, alarmTopic }
}
