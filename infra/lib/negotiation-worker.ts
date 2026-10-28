import { Duration } from 'aws-cdk-lib'
import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import { CLAUDE_INVOKE_ACTIONS, CLAUDE_INVOKE_RESOURCES, DATABASE_NAME, name, REGION } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

// The advocates' runner (extensions.md section 9). Its role may read and write the database as hold_worker, ask Claude
// on Bedrock, and read the display copies of photographs for the advocates to look at, and nothing else: no PayPal
// credentials, no queue to send money work to, no original photographs and nothing written to storage. A capture
// after an agreement is queued through the outbox by the person's confirmation, never by this function.
export const NEGOTIATION_TIMEOUT = Duration.minutes(10)

export function createNegotiationWorker(stack: Stack, props: WorkerProps): void {
  const queue = props.queues.get('negotiations')
  if (queue === undefined) throw new Error('No negotiations queue.')
  const role = new iam.Role(stack, 'NegotiationRole', { roleName: name('negotiation'), description: 'Hold negotiation: runs the two advocates through the referee; no PayPal access', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  props.workerUserSecret.grantRead(role)
  // The advocates' model, and the model a refusal falls back to.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'], conditions: { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } } }))
  role.addToPolicy(new iam.PolicyStatement({ actions: CLAUDE_INVOKE_ACTIONS, resources: CLAUDE_INVOKE_RESOURCES }))
  // The photographs of a disputed line, as the advocates' get_line_photos returns them: display copies, read only.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [props.displayBucket.arnForObjects('*')] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/${name('worker', 'negotiation')}*:*`] }))
  const environment = { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME, HOLD_DISPLAY_BUCKET: props.displayBucket.bucketName }
  const worker = workerFunction(stack, 'NegotiationWorker', name('worker', 'negotiations'), 'negotiations-lambda.ts', role, environment, { timeout: NEGOTIATION_TIMEOUT })
  worker.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }))

  // A negotiation nobody moves, such as one whose renter's own assistant went quiet, goes to the owner once its time
  // is up. Same role: it only ends negotiations, through the same database functions.
  const sweep = workerFunction(stack, 'NegotiationSweep', name('worker', 'negotiation', 'sweep'), 'negotiation-sweep-lambda.ts', role, { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME })
  sweep.grantInvoke(props.schedulerRole)
  new scheduler.CfnSchedule(stack, 'NegotiationSweepSchedule', {
    name: name('negotiation', 'sweep'),
    groupName: props.scheduleGroup.scheduleGroupName,
    description: 'Sends to the owner each negotiation nobody moved in time',
    scheduleExpression: 'rate(5 minutes)',
    flexibleTimeWindow: { mode: 'OFF' },
    target: { arn: sweep.functionArn, roleArn: props.schedulerRole.roleArn, retryPolicy: { maximumRetryAttempts: 0 } },
  })
}
