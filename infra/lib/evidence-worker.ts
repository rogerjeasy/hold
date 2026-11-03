import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { ACCOUNT, DATABASE_NAME, name, REGION, SMTP_SECRET_NAME } from './settings.ts'
import { allowPushes, PUSH_ENVIRONMENT } from './pushes.ts'
import { allowTexting, textEnvironment } from './texts.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

function databaseRole(stack: Stack, props: WorkerProps, id: string, purpose: string): iam.Role {
  const role = new iam.Role(stack, id, { roleName: name(purpose), description: `Hold ${purpose}: worker database access and its own logs`, assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  props.workerUserSecret.grantRead(role)
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${name('worker', purpose)}:*`] }))
  return role
}

export function createEvidenceWorkers(stack: Stack, props: WorkerProps): void {
  const evidenceQueue = props.queues.get('evidence')
  const messagesQueue = props.queues.get('messages')
  if (evidenceQueue === undefined || messagesQueue === undefined) throw new Error('Missing evidence or messages queue.')
  const environment = { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME }
  const evidenceRole = databaseRole(stack, props, 'EvidenceRole', 'evidence')
  evidenceRole.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [props.displayBucket.arnForObjects('*')] }))
  evidenceRole.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'], resources: [props.evidenceBucket.arnForObjects('packs/*')] }))
  // Both buckets use AWS-managed S3 encryption with bucket keys, whose encryption context is the bucket ARN.
  evidenceRole.addToPolicy(new iam.PolicyStatement({ actions: ['kms:Decrypt', 'kms:GenerateDataKey'], resources: [`arn:aws:kms:${REGION}:${ACCOUNT}:key/*`], conditions: { StringEquals: { 'kms:ViaService': `s3.${REGION}.amazonaws.com`, 'kms:CallerAccount': ACCOUNT, 'kms:EncryptionContext:aws:s3:arn': [props.evidenceBucket.bucketArn, props.displayBucket.bucketArn] }, 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' } } }))
  // PDFKit needs its font data; the evidence package also imports sharp, whose native loader must remain external.
  const evidence = workerFunction(stack, 'EvidenceWorker', name('worker', 'evidence'), 'evidence-lambda.ts', evidenceRole, { ...environment, HOLD_EVIDENCE_BUCKET: props.evidenceBucket.bucketName, HOLD_DISPLAY_BUCKET: props.displayBucket.bucketName }, { memorySize: 1536 })
  evidence.addEventSource(new SqsEventSource(evidenceQueue, { batchSize: 1, reportBatchItemFailures: true }))

  const receiptRole = databaseRole(stack, props, 'ReceiptRole', 'receipts')
  props.renterLinkKey.grantRead(receiptRole)
  secretsmanager.Secret.fromSecretNameV2(stack, 'ReceiptSmtpLogin', SMTP_SECRET_NAME).grantRead(receiptRole)
  allowTexting(receiptRole)
  allowPushes(receiptRole)
  const receipts = workerFunction(stack, 'ReceiptWorker', name('worker', 'receipts'), 'receipt-lambda.ts', receiptRole, { ...environment, HOLD_SMTP_SECRET: SMTP_SECRET_NAME, HOLD_PUBLIC_URL: props.publicUrl, HOLD_RENTER_LINK_KEY_SECRET_ARN: props.renterLinkKey.secretArn, ...textEnvironment(props.texts), ...PUSH_ENVIRONMENT })
  receipts.addEventSource(new SqsEventSource(messagesQueue, { batchSize: 1, reportBatchItemFailures: true }))
}
