import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as smsvoice from 'aws-cdk-lib/aws-smsvoice'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { ACCOUNT, DATABASE_NAME, name, REGION } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

// Texts to renters through AWS End User Messaging (architecture.md section 12.3). `sender` is the account's
// registered number or sender name, once an administrator has one; unset, AWS chooses. `reports` turns on the
// configuration set that reports each text's delivery, which CloudFormation may make only once HoldDelivery allows it.
export type TextSettings = { readonly sender: string | undefined; readonly reports: boolean }

export const TEXT_CONFIGURATION_SET = name('texts')

// The outcomes worth a person's eye: delivered, or never to arrive. The worker ignores the rest.
const REPORTED_EVENTS = ['TEXT_DELIVERED', 'TEXT_BLOCKED', 'TEXT_CARRIER_BLOCKED', 'TEXT_CARRIER_UNREACHABLE', 'TEXT_INVALID', 'TEXT_INVALID_MESSAGE', 'TEXT_SPAM', 'TEXT_TTL_EXPIRED', 'TEXT_UNKNOWN', 'TEXT_UNREACHABLE']

// Sending a text, nothing else of the service. A text names a sender, an opt-out list and maybe a configuration set,
// which AWS chooses when Hold names none, so the grant cannot name them in advance. What a text may say and to whom is
// the app's own rule (TEXT_LIMITS and textAllowed in packages/domain).
export function allowTexting(role: iam.Role): void {
  role.addToPolicy(new iam.PolicyStatement({ actions: ['sms-voice:SendTextMessage'], resources: ['*'] }))
}

export function textEnvironment(texts: TextSettings): Record<string, string> {
  return {
    ...(texts.sender === undefined ? {} : { HOLD_TEXT_SENDER: texts.sender }),
    ...(texts.reports ? { HOLD_TEXT_CONFIGURATION_SET: TEXT_CONFIGURATION_SET } : {}),
  }
}

// Each text's delivery report, from the configuration set to a topic only AWS End User Messaging in this account may
// publish to, then to the text-reports queue and the texts worker, which records it as hold_worker.
export function createTextReports(stack: Stack, props: WorkerProps): void {
  const queue = props.queues.get('text-reports')
  if (queue === undefined) throw new Error('Missing the text-reports queue.')
  const topic = new sns.Topic(stack, 'TextReportsTopic', { topicName: name('text', 'reports'), enforceSSL: true })
  topic.addToResourcePolicy(new iam.PolicyStatement({ actions: ['sns:Publish'], principals: [new iam.ServicePrincipal('sms-voice.amazonaws.com')], resources: [topic.topicArn], conditions: { StringEquals: { 'aws:SourceAccount': ACCOUNT } } }))
  topic.addSubscription(new subscriptions.SqsSubscription(queue, { rawMessageDelivery: true }))
  new smsvoice.CfnConfigurationSet(stack, 'TextConfigurationSet', {
    configurationSetName: TEXT_CONFIGURATION_SET,
    eventDestinations: [{ eventDestinationName: name('text', 'reports'), enabled: true, matchingEventTypes: REPORTED_EVENTS, snsDestination: { topicArn: topic.topicArn } }],
  })
  const role = new iam.Role(stack, 'TextsRole', { roleName: name('texts'), description: 'Hold texts: records delivery reports of renters texts, as hold_worker', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  props.workerUserSecret.grantRead(role)
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${name('worker', 'texts')}:*`] }))
  const worker = workerFunction(stack, 'TextsWorker', name('worker', 'texts'), 'texts-lambda.ts', role, { HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn, HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn, HOLD_DATABASE_NAME: DATABASE_NAME })
  worker.addEventSource(new SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }))
}
