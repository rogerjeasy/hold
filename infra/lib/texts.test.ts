import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'
import type { HoldAppOptions } from './hold-app.ts'

// Texts to renters through AWS End User Messaging (architecture.md section 12.3).
const context = { ...(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>), 'aws:cdk:bundling-stacks': [] }
const build = (options: Partial<HoldAppOptions> = {}) => createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: '0123456789abcdef0123456789abcdef01234567', webPublicUrl: 'https://hold.example', ...options })
const off = build()
const on = build({ textReports: true, textSender: 'RIBEIRA' })

type Statement = { Action: string | string[]; Resource: unknown; Effect?: string; Condition?: Record<string, unknown>; Principal?: unknown }
const policyStatements = (template: Template, rolePrefix: string): Statement[] =>
  Object.entries(template.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith(rolePrefix)).flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement)
const actions = (statements: readonly Statement[]) => statements.flatMap((statement) => [statement.Action].flat())

describe('texts to renters', () => {
  const work = Template.fromStack(off.work.stack)
  const web = Template.fromStack(off.web.stack)

  it('lets the web app, the worker, receipts and operations send a text, and do nothing else with AWS End User Messaging', () => {
    for (const [template, role] of [[web, 'InstanceRole'], [work, 'WorkerRole'], [work, 'ReceiptRole'], [work, 'OperationsRole']] as const) {
      const granted = actions(policyStatements(template, role)).filter((action) => action.startsWith('sms-voice:'))
      expect(granted, role).toEqual(['sms-voice:SendTextMessage'])
    }
    for (const role of ['ComparisonRole', 'NegotiationRole', 'EvidenceRole']) expect(actions(policyStatements(work, role)).some((action) => action.startsWith('sms-voice:')), role).toBe(false)
  })

  it('lets the permissions boundary allow sending a text, and nothing more of the service', () => {
    const delivery = Template.fromStack(off.delivery.stack)
    const boundary = Object.values(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-permissions-boundary' } }))[0] as { Properties: { PolicyDocument: { Statement: Statement[] } } }
    expect(actions(boundary.Properties.PolicyDocument.Statement).filter((action) => action.startsWith('sms-voice:'))).toEqual(['sms-voice:SendTextMessage'])
  })

  it('makes no configuration set and names none while delivery reports are off', () => {
    work.resourceCountIs('AWS::SMSVOICE::ConfigurationSet', 0)
    expect(JSON.stringify(work.toJSON())).not.toContain('HOLD_TEXT_CONFIGURATION_SET')
    expect(JSON.stringify(web.toJSON())).not.toContain('HOLD_TEXT_CONFIGURATION_SET')
  })

  describe('with delivery reports on', () => {
    const reporting = Template.fromStack(on.work.stack)
    it('reports each text’s outcome to a topic only AWS End User Messaging in this account may publish to', () => {
      reporting.hasResourceProperties('AWS::SMSVOICE::ConfigurationSet', {
        ConfigurationSetName: 'hold-texts',
        EventDestinations: [Match.objectLike({ Enabled: true, MatchingEventTypes: Match.arrayWith(['TEXT_DELIVERED', 'TEXT_BLOCKED']), SnsDestination: { TopicArn: Match.anyValue() } })],
      })
      reporting.hasResourceProperties('AWS::SNS::TopicPolicy', {
        PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'sns:Publish', Effect: 'Allow', Principal: { Service: 'sms-voice.amazonaws.com' }, Condition: { StringEquals: { 'aws:SourceAccount': '707938860881' } } })]) },
      })
    })

    it('hands the reports to the texts worker through a queue with its dead-letter queue, as they arrive', () => {
      reporting.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'sqs', RawMessageDelivery: true })
      reporting.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'hold-text-reports' })
      reporting.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'hold-text-reports-dead-letter' })
      reporting.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-texts', Role: { 'Fn::GetAtt': [Match.stringLikeRegexp('^TextsRole'), 'Arn'] } })
      const granted = JSON.stringify(policyStatements(reporting, 'TextsRole'))
      expect(granted).not.toMatch(/sms-voice|paypal|smtp|s3:|sqs:SendMessage/)
    })

    it('names the sender and the configuration set to every function that sends a text', () => {
      reporting.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-receipts', Environment: { Variables: Match.objectLike({ HOLD_TEXT_SENDER: 'RIBEIRA', HOLD_TEXT_CONFIGURATION_SET: 'hold-texts' }) } })
      reporting.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-operations', Environment: { Variables: Match.objectLike({ HOLD_TEXT_CONFIGURATION_SET: 'hold-texts' }) } })
      Template.fromStack(on.web.stack).hasResourceProperties('AWS::AppRunner::Service', { SourceConfiguration: { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentVariables: Match.arrayWith([{ Name: 'HOLD_TEXT_SENDER', Value: 'RIBEIRA' }, { Name: 'HOLD_TEXT_CONFIGURATION_SET', Value: 'hold-texts' }]) } } } })
    })

    it('lets CloudFormation make only Hold’s configuration set and topic, and hand the texts worker its role', () => {
      const delivery = JSON.stringify(Template.fromStack(on.delivery.stack).toJSON())
      expect(delivery).toContain('configuration-set/hold-*')
      expect(delivery).toContain(':hold-*')
      expect(delivery).toContain('role/hold-texts')
    })
  })
})
