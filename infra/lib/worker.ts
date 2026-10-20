import { join } from 'node:path'
import { Duration } from 'aws-cdk-lib'
import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as s3 from 'aws-cdk-lib/aws-s3'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type * as sqs from 'aws-cdk-lib/aws-sqs'
import { ACCOUNT, DATABASE_NAME, name, REGION, secretName, SMTP_SECRET_NAME } from './settings.ts'

// The worker (architecture.md section 14.4): Lambda functions fed by SQS, which App Runner cannot be, since it throttles
// between requests. One applies PayPal's events, one carries out executions, one keeps placed holds watched, and one
// relays the outbox every minute.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

// Long enough for a paused Aurora cluster to wake, which the Data API client waits up to three minutes for. Each
// queue keeps a message hidden for longer than this (work-stack.ts), so two functions never handle it at once.
export const WORKER_TIMEOUT = Duration.minutes(4)

export type WorkerProps = {
  readonly cluster: rds.IDatabaseCluster
  readonly workerUserSecret: secretsmanager.ISecret
  readonly queues: ReadonlyMap<string, sqs.Queue>
  readonly scheduleGroup: scheduler.ScheduleGroup
  readonly schedulerRole: iam.Role
  // The web app's own address, for links in the emails the worker sends.
  readonly publicUrl: string
  // Signs the renter links the worker emails. Never the web app's cookie key.
  readonly renterLinkKey: secretsmanager.ISecret
  readonly evidenceBucket: s3.IBucket
  readonly displayBucket: s3.IBucket
}

function workerRole(stack: Stack, props: WorkerProps): iam.Role {
  const role = new iam.Role(stack, 'WorkerRole', {
    roleName: name('worker'),
    // IAM takes only Latin-1 here, so no typographic apostrophe.
    description: 'The Hold worker: settles money with PayPal from the queues, as hold_worker',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  })
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'],
      resources: [props.cluster.clusterArn],
    }),
  )
  // Its own login, the renter-link key, each shop's PayPal credentials and Hold's SMTP login, to read, never to write.
  const secrets = `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:`
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.workerUserSecret.secretArn, props.renterLinkKey.secretArn, `${secrets}${secretName('paypal', 'shops')}/*`, `${secrets}${SMTP_SECRET_NAME}-*`],
    }),
  )
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${name('worker')}-*:*`],
    }),
  )
  // A hold's upkeep: one-off schedules in Hold's group, which send with the scheduler's role and no other.
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule'],
      resources: [`arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${props.scheduleGroup.scheduleGroupName}/*`],
    }),
  )
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [props.schedulerRole.roleArn],
      conditions: { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } },
    }),
  )
  // Display copies: it reads a locked original, finds its faces, and writes the blurred copy. It deletes nothing.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [props.evidenceBucket.arnForObjects('*')] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:PutObject'], resources: [props.displayBucket.arnForObjects('*')] }))
  // DetectFaces names no resource.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rekognition:DetectFaces'], resources: ['*'] }))
  for (const queueName of ['paypal-events', 'executions', 'upkeep', 'comparisons', 'media']) {
    const queue = props.queues.get(queueName)
    if (queue === undefined) throw new Error(`No ${queueName} queue.`)
    queue.grantSendMessages(role)
  }
  return role
}

// sharp ships a native binary for the machine it is installed on, so it is installed, not bundled. The deploy runs on
// Linux x86-64, as Lambda does.
type FunctionOptions = { readonly memorySize?: number; readonly nativeModules?: readonly string[] }

export function workerFunction(stack: Stack, id: string, functionName: string, entry: string, role: iam.Role, environment: Record<string, string>, options: FunctionOptions = {}): nodejs.NodejsFunction {
  return new nodejs.NodejsFunction(stack, id, {
    functionName,
    description: `Hold worker: ${entry}`,
    entry: join(REPO_ROOT, 'apps', 'worker', 'src', entry),
    projectRoot: REPO_ROOT,
    depsLockFilePath: join(REPO_ROOT, 'pnpm-lock.yaml'),
    runtime: lambda.Runtime.NODEJS_24_X,
    memorySize: options.memorySize ?? 512,
    timeout: WORKER_TIMEOUT,
    role,
    environment,
    bundling: { minify: true, sourceMap: false, ...(options.nativeModules === undefined ? {} : { nodeModules: [...options.nativeModules] }) },
  })
}

export function createWorker(stack: Stack, props: WorkerProps): void {
  const role = workerRole(stack, props)
  const queue = (queueName: string) => {
    const found = props.queues.get(queueName)
    if (found === undefined) throw new Error(`No ${queueName} queue.`)
    return found
  }
  const environment = {
    HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
    HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn,
    HOLD_DATABASE_NAME: DATABASE_NAME,
    HOLD_EXECUTIONS_QUEUE_URL: queue('executions').queueUrl,
    HOLD_PAYPAL_EVENTS_QUEUE_URL: queue('paypal-events').queueUrl,
    HOLD_UPKEEP_QUEUE_URL: queue('upkeep').queueUrl,
    HOLD_COMPARISONS_QUEUE_URL: queue('comparisons').queueUrl,
    HOLD_MEDIA_QUEUE_URL: queue('media').queueUrl,
    HOLD_UPKEEP_QUEUE_ARN: queue('upkeep').queueArn,
    HOLD_SCHEDULE_GROUP: props.scheduleGroup.scheduleGroupName,
    HOLD_SCHEDULER_ROLE_ARN: props.schedulerRole.roleArn,
    HOLD_SMTP_SECRET: SMTP_SECRET_NAME,
    HOLD_PUBLIC_URL: props.publicUrl,
    HOLD_RENTER_LINK_KEY_SECRET_ARN: props.renterLinkKey.secretArn,
    HOLD_EVIDENCE_BUCKET: props.evidenceBucket.bucketName,
    HOLD_DISPLAY_BUCKET: props.displayBucket.bucketName,
  }

  const events = workerFunction(stack, 'PayPalEventsWorker', name('worker', 'paypal', 'events'), 'paypal-events-lambda.ts', role, environment)
  const executions = workerFunction(stack, 'ExecutionsWorker', name('worker', 'executions'), 'executions-lambda.ts', role, environment)
  const upkeep = workerFunction(stack, 'UpkeepWorker', name('worker', 'upkeep'), 'upkeep-lambda.ts', role, environment)
  // Image work needs room: a 12-megapixel original is about 36 MB of pixels.
  const media = workerFunction(stack, 'MediaWorker', name('worker', 'media'), 'media-lambda.ts', role, environment, { memorySize: 1536, nativeModules: ['sharp'] })
  const relay = workerFunction(stack, 'OutboxRelayWorker', name('worker', 'outbox', 'relay'), 'outbox-relay-lambda.ts', role, environment)

  // A message whose work failed is named back, so only it is tried again; the rest of the batch is done.
  events.addEventSource(new SqsEventSource(queue('paypal-events'), { batchSize: 5, reportBatchItemFailures: true }))
  executions.addEventSource(new SqsEventSource(queue('executions'), { batchSize: 5, reportBatchItemFailures: true }))
  upkeep.addEventSource(new SqsEventSource(queue('upkeep'), { batchSize: 5, reportBatchItemFailures: true }))
  media.addEventSource(new SqsEventSource(queue('media'), { batchSize: 2, reportBatchItemFailures: true }))

  relay.grantInvoke(props.schedulerRole)
  new scheduler.CfnSchedule(stack, 'OutboxRelaySchedule', {
    name: name('outbox', 'relay'),
    groupName: props.scheduleGroup.scheduleGroupName,
    description: 'Sends what waits in the outbox to its queue',
    scheduleExpression: 'rate(1 minute)',
    flexibleTimeWindow: { mode: 'OFF' },
    target: { arn: relay.functionArn, roleArn: props.schedulerRole.roleArn, retryPolicy: { maximumRetryAttempts: 0 } },
  })
}
