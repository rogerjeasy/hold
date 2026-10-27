import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import { ACCOUNT, DATABASE_NAME, name, REGION, secretName, SMTP_SECRET_NAME } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

// The operations agent (extensions.md section 6): a nightly fan-out sends one message per shop to the ops-agent
// queue, and its function runs the shop's detectors, reminders and investigation. Its role reads each shop's PayPal
// credentials, to read PayPal and to lend the shop's token to PayPal's MCP server, and may call the model. It writes
// no photograph, schedules nothing and sends to no money queue: an approved release or replacement is carried out by
// the web app's own approval path, and its third function sends only an approved message or dispute answer.
export function createOperationsWorker(stack: Stack, props: WorkerProps): void {
  const queue = props.queues.get('ops-agent')
  const executeQueue = props.queues.get('ops-execute')
  if (queue === undefined || executeQueue === undefined) throw new Error('No ops-agent or ops-execute queue.')
  const role = new iam.Role(stack, 'OperationsRole', { roleName: name('operations'), description: 'Hold operations agent: reads records and PayPal, calls the model, writes proposals; moves no money', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  const secrets = `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:`
  role.addToPolicy(new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [props.workerUserSecret.secretArn, `${secrets}${secretName('paypal', 'shops')}/*`, `${secrets}${SMTP_SECRET_NAME}-*`] }))
  // Mantle authorizes by model condition rather than model ARN, as for the comparison worker.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'], conditions: { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } } }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${name('worker', 'operations')}*:*`] }))
  queue.grantSendMessages(role)
  const environment = {
    HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
    HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn,
    HOLD_DATABASE_NAME: DATABASE_NAME,
    HOLD_OPS_AGENT_QUEUE_URL: queue.queueUrl,
    HOLD_SMTP_SECRET: SMTP_SECRET_NAME,
  }
  const agent = workerFunction(stack, 'OperationsWorker', name('worker', 'operations'), 'ops-agent-lambda.ts', role, environment, { memorySize: 1024 })
  agent.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }))
  const execute = workerFunction(stack, 'OperationsExecuteWorker', name('worker', 'operations', 'execute'), 'ops-execute-lambda.ts', role, environment)
  execute.addEventSource(new SqsEventSource(executeQueue, { batchSize: 1, reportBatchItemFailures: true }))
  const nightly = workerFunction(stack, 'OperationsNightlyWorker', name('worker', 'operations', 'nightly'), 'ops-nightly-lambda.ts', role, environment)
  nightly.grantInvoke(props.schedulerRole)
  new scheduler.CfnSchedule(stack, 'OperationsNightlySchedule', {
    name: name('operations', 'nightly'),
    groupName: props.scheduleGroup.scheduleGroupName,
    description: 'One operations run per shop, after the night',
    scheduleExpression: 'cron(0 2 * * ? *)',
    flexibleTimeWindow: { mode: 'OFF' },
    target: { arn: nightly.functionArn, roleArn: props.schedulerRole.roleArn, retryPolicy: { maximumRetryAttempts: 2 } },
  })
}
