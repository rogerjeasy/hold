import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import { DATABASE_NAME, name, REGION } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

export function createComparisonWorker(stack: Stack, props: WorkerProps): void {
  const queue = props.queues.get('comparisons')
  if (queue === undefined) throw new Error('No comparisons queue.')
  const role = new iam.Role(stack, 'ComparisonRole', { roleName: name('comparison'), description: 'Hold comparison: reads evidence and invokes the comparison model; no PayPal access', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  props.workerUserSecret.grantRead(role)
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [props.evidenceBucket.arnForObjects('*')] }))
  // Mantle authorizes by model condition rather than model ARN:
  // https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-managed-agents-openai-security.html
  role.addToPolicy(new iam.PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'], conditions: { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } } }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/${name('worker', 'comparisons')}:*`] }))
  const worker = workerFunction(stack, 'ComparisonWorker', name('worker', 'comparisons'), 'comparisons-lambda.ts', role, { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME, HOLD_EVIDENCE_BUCKET: props.evidenceBucket.bucketName, HOLD_DISPLAY_BUCKET: props.displayBucket.bucketName }, { memorySize: 1536, nativeModules: ['sharp', '@techstark/opencv-js'] })
  worker.addEventSource(new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }))
}
