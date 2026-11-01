import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'

const context = { ...(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>), 'aws:cdk:bundling-stacks': [] }
const stacks = createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: '0123456789abcdef0123456789abcdef01234567', webPublicUrl: 'https://hold.example' })
const work = Template.fromStack(stacks.work.stack)
const delivery = Template.fromStack(stacks.delivery.stack)
const web = Template.fromStack(stacks.web.stack)
type Statement = { Action: string | string[]; Resource: unknown; Condition?: Record<string, unknown> }
const statements = (role: string): Statement[] => Object.entries(work.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith(role)).flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement)

describe('evidence and receipt workers', () => {
  it('allows authenticated web downloads of exact document versions and immediate build delivery', () => {
    const policies = Object.values(web.findResources('AWS::IAM::Policy')).flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement)
    const versioned = policies.filter((entry) => [entry.Action].flat().includes('s3:GetObjectVersion'))
    expect(versioned).toHaveLength(1)
    expect(versioned[0]?.Action).toBe('s3:GetObjectVersion')
    expect(JSON.stringify(versioned[0]?.Resource)).toContain('/packs/*')
    web.hasResourceProperties('AWS::AppRunner::Service', { SourceConfiguration: { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentVariables: Match.arrayWith([{ Name: 'HOLD_EVIDENCE_QUEUE_URL', Value: Match.anyValue() }]) } } } })
  })
  it.each([['evidence', 'EvidenceWorker', 'evidence', 300], ['receipts', 'ReceiptWorker', 'messages', 360]] as const)('feeds %s from its queue with individual failure reporting', (worker, logicalId, queue, visibility) => {
    work.hasResourceProperties('AWS::Lambda::Function', { FunctionName: `hold-worker-${worker}`, Runtime: 'nodejs24.x', Timeout: 240 })
    work.hasResourceProperties('AWS::Lambda::EventSourceMapping', { FunctionName: { Ref: Match.stringLikeRegexp(`^${logicalId}`) }, BatchSize: 1, FunctionResponseTypes: ['ReportBatchItemFailures'], EventSourceArn: { 'Fn::GetAtt': [Match.stringLikeRegexp(`^${queue}[A-F0-9]`), 'Arn'] } })
    work.hasResourceProperties('AWS::SQS::Queue', { QueueName: `hold-${queue}${queue === 'evidence' ? '.fifo' : ''}`, VisibilityTimeout: visibility })
  })

  it('lets evidence read blurred display bytes and read/create only document objects', () => {
    const policy = statements('EvidenceRole')
    expect(policy.length).toBeGreaterThan(0)
    const encoded = JSON.stringify(policy)
    expect(encoded).not.toMatch(/paypal|smtp|RenterLink|s3:Delete|s3:Bypass|sqs:SendMessage/)
    const evidence = policy.find((entry) => JSON.stringify(entry.Resource).includes('EvidenceBucket'))
    const display = policy.find((entry) => JSON.stringify(entry.Resource).includes('DisplayBucket'))
    expect(new Set([evidence?.Action].flat())).toEqual(new Set(['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject']))
    expect(JSON.stringify(evidence?.Resource)).toContain('/packs/*')
    expect([display?.Action].flat()).toEqual(['s3:GetObject'])
    expect(encoded).toContain('WorkerUserSecret')
  })

  it('confines evidence key use to aws/s3 through its two encrypted buckets', () => {
    const keyPolicy = statements('EvidenceRole').filter((entry) => [entry.Action].flat().some((action) => action.startsWith('kms:')))
    expect(keyPolicy).toHaveLength(1)
    expect(new Set([keyPolicy[0]?.Action].flat())).toEqual(new Set(['kms:Decrypt', 'kms:GenerateDataKey']))
    expect(keyPolicy[0]?.Resource).toBe('arn:aws:kms:us-east-1:707938860881:key/*')
    expect(keyPolicy[0]?.Condition).toMatchObject({ StringEquals: { 'kms:ViaService': 's3.us-east-1.amazonaws.com', 'kms:CallerAccount': '707938860881' }, 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' } })
    const conditions = JSON.stringify(keyPolicy[0]?.Condition)
    expect(conditions).toContain('kms:EncryptionContext:aws:s3:arn')
    expect(conditions).toContain('EvidenceBucket')
    expect(conditions).toContain('DisplayBucket')
  })

  it('lets receipts read only their database, SMTP and link-key secrets, consume messages and text a renter who chose texts', () => {
    const policy = statements('ReceiptRole')
    const actions = new Set(policy.flatMap((entry) => [entry.Action].flat()))
    expect(actions).toEqual(new Set(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction', 'secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'sqs:GetQueueUrl', 'sqs:GetQueueAttributes', 'sms-voice:SendTextMessage']))
    const encoded = JSON.stringify(policy)
    for (const expected of ['WorkerUserSecret', 'RenterLinkKey', 'hold/email/smtp']) expect(encoded).toContain(expected)
    expect(encoded).not.toMatch(/paypal|s3:|kms:|sqs:SendMessage|scheduler:/)
    work.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-receipts', Environment: { Variables: Match.objectLike({ HOLD_SMTP_SECRET: 'hold/email/smtp', HOLD_PUBLIC_URL: 'https://hold.example', HOLD_RENTER_LINK_KEY_SECRET_ARN: Match.anyValue() }) } })
  })

  it('lets the relay send evidence and receipt jobs without granting those workers money queues', () => {
    const sends = statements('WorkerRole').filter((entry) => [entry.Action].flat().includes('sqs:SendMessage'))
    expect(JSON.stringify(sends)).toMatch(/evidence/)
    expect(JSON.stringify(sends)).toMatch(/messages/)
    work.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-outbox-relay', Environment: { Variables: Match.objectLike({ HOLD_EVIDENCE_QUEUE_URL: Match.anyValue(), HOLD_MESSAGES_QUEUE_URL: Match.anyValue() }) } })
    const policy = JSON.stringify(delivery.findResources('AWS::IAM::ManagedPolicy'))
    expect(policy).toContain('s3:GetObjectVersion')
    expect(policy).toContain('kms:EncryptionContext:aws:s3:arn')
    expect(policy).toContain('alias/aws/s3')
  })
})
