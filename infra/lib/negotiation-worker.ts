import { Duration } from 'aws-cdk-lib'
import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import { DATABASE_NAME, name, REGION } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

// The advocates' runner (extensions.md section 9). Its role may read and write the database as hold_worker and ask
// Claude on Bedrock, and nothing else: no PayPal credentials, no queue to send money work to, no photographs. A capture
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
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/${name('worker', 'negotiations')}:*`] }))
  const worker = workerFunction(stack, 'NegotiationWorker', name('worker', 'negotiations'), 'negotiations-lambda.ts', role, { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME }, { timeout: NEGOTIATION_TIMEOUT })
  worker.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }))
}
