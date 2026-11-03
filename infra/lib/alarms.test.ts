import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'
import type { HoldAppOptions } from './hold-app.ts'
import { ACCOUNT, MONTHLY_BUDGET_USD } from './settings.ts'
import { MONEY_QUEUES, QUEUES } from './work-stack.ts'

// Telling a person when Hold fails (architecture.md section 17.1): every alarm reports to one topic, which emails the
// address the deploy names, if it names one.
const context = { ...(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>), 'aws:cdk:bundling-stacks': [] }
const build = (options: Partial<HoldAppOptions> = {}) => createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: '0123456789abcdef0123456789abcdef01234567', webPublicUrl: 'https://hold.example', ...options })
const silent = build()
const told = build({ alarmEmail: 'ops@example.com', monthlyBudgetUsd: 250 })

type Alarm = { Properties: Record<string, unknown> }
const alarmsOf = (template: Template) => Object.values(template.findResources('AWS::CloudWatch::Alarm')) as Alarm[]
const alarmNamed = (template: Template, alarmName: string) => {
  const found = alarmsOf(template).find((alarm) => alarm.Properties['AlarmName'] === alarmName)
  if (found === undefined) throw new Error(`No alarm ${alarmName}.`)
  return found.Properties
}

describe('the alarm topic', () => {
  const work = Template.fromStack(silent.work.stack)

  it('is one topic of Hold’s, reached only over TLS', () => {
    work.resourceCountIs('AWS::SNS::Topic', 1)
    work.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'hold-alarms' })
    work.hasResourceProperties('AWS::SNS::TopicPolicy', { PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) } })
  })

  it('subscribes no one while the deploy names no address, so no address is committed', () => {
    work.resourceCountIs('AWS::SNS::Subscription', 0)
  })

  it('emails the address the deploy names', () => {
    Template.fromStack(told.work.stack).hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.com', TopicArn: { Ref: Match.stringLikeRegexp('^AlarmTopic') } })
  })

  it('lets only Hold’s alarms and this account’s budgets publish to it', () => {
    work.hasResourceProperties('AWS::SNS::TopicPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'sns:Publish', Effect: 'Allow', Principal: { Service: 'cloudwatch.amazonaws.com' }, Condition: { StringEquals: { 'aws:SourceAccount': ACCOUNT }, ArnLike: { 'aws:SourceArn': `arn:aws:cloudwatch:us-east-1:${ACCOUNT}:alarm:hold-*` } } }),
          Match.objectLike({ Action: 'sns:Publish', Effect: 'Allow', Principal: { Service: 'budgets.amazonaws.com' }, Condition: { StringEquals: { 'aws:SourceAccount': ACCOUNT }, ArnLike: { 'aws:SourceArn': `arn:aws:budgets::${ACCOUNT}:*` } } }),
        ]),
      },
    })
  })
})

describe('every alarm', () => {
  it.each([
    ['HoldWork', Template.fromStack(silent.work.stack)],
    ['HoldWeb', Template.fromStack(silent.web.stack)],
  ])('in %s tells the topic when it goes off and when it clears', (_stack, template) => {
    const alarms = alarmsOf(template)
    expect(alarms.length).toBeGreaterThan(0)
    for (const alarm of alarms) {
      const name = String(alarm.Properties['AlarmName'])
      expect(JSON.stringify(alarm.Properties['AlarmActions']), name).toMatch(/AlarmTopic/)
      expect(JSON.stringify(alarm.Properties['OKActions']), name).toMatch(/AlarmTopic/)
    }
  })

  it('lives only where the topic reaches it', () => {
    for (const template of [silent.data, silent.identity, silent.registry, silent.delivery].map((resources) => Template.fromStack(resources.stack))) {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 0)
    }
  })
})

describe('alarms on failing work', () => {
  const work = Template.fromStack(silent.work.stack)

  it.each(QUEUES)('goes off when a message on $name is set aside', (spec) => {
    expect(alarmNamed(work, `hold-${spec.name}-dead-letter`)).toMatchObject({ MetricName: 'ApproximateNumberOfMessagesVisible', Threshold: 0 })
  })

  it.each(MONEY_QUEUES)('goes off when money work on %s waits more than fifteen minutes, before it would be set aside', (queueName) => {
    expect(alarmNamed(work, `hold-${queueName}-waiting`)).toMatchObject({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Statistic: 'Maximum',
      ComparisonOperator: 'GreaterThanThreshold',
      Threshold: 15 * 60,
      TreatMissingData: 'notBreaching',
    })
  })

  it('goes off when the outbox relay fails for fifteen minutes, or stops running at all', () => {
    const alarm = alarmNamed(work, 'hold-outbox-relay-failing')
    expect(JSON.stringify(alarm['Dimensions'])).toMatch(/^\[\{"Name":"FunctionName","Value":\{"Ref":"OutboxRelayWorker[0-9A-F]+"\}\}\]$/)
    expect(alarm).toMatchObject({
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 3,
      DatapointsToAlarm: 3,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      TreatMissingData: 'breaching',
    })
  })
})

describe('the web app’s alarm', () => {
  it('goes off when the web app answers with server errors', () => {
    expect(alarmNamed(Template.fromStack(silent.web.stack), 'hold-web-server-errors')).toMatchObject({
      Namespace: 'AWS/AppRunner',
      MetricName: '5xxStatusResponses',
      Dimensions: [
        { Name: 'ServiceID', Value: { 'Fn::GetAtt': ['Service', 'ServiceId'] } },
        { Name: 'ServiceName', Value: 'hold-web' },
      ],
      Statistic: 'Sum',
      Period: 300,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 3,
      TreatMissingData: 'notBreaching',
    })
  })
})

describe('the monthly budget', () => {
  type Budget = { Budget: Record<string, unknown>; NotificationsWithSubscribers: { Notification: Record<string, unknown>; Subscribers: { SubscriptionType: string; Address: unknown }[] }[] }
  const budgetOf = (template: Template) => (Object.values(template.findResources('AWS::Budgets::Budget'))[0] as { Properties: Budget }).Properties

  it('watches the account’s cost each month, at the default amount unless the deploy names another', () => {
    expect(budgetOf(Template.fromStack(silent.work.stack)).Budget).toEqual({ BudgetName: 'hold-account-monthly', BudgetType: 'COST', TimeUnit: 'MONTHLY', BudgetLimit: { Amount: MONTHLY_BUDGET_USD, Unit: 'USD' } })
    expect(budgetOf(Template.fromStack(told.work.stack)).Budget).toMatchObject({ BudgetLimit: { Amount: 250, Unit: 'USD' } })
  })

  it('tells the alarm topic at 80% and 100% of the amount spent, and when the month is forecast to pass it', () => {
    const notifications = budgetOf(Template.fromStack(silent.work.stack)).NotificationsWithSubscribers
    expect(notifications.map((each) => each.Notification)).toEqual([
      { NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 80, ThresholdType: 'PERCENTAGE' },
      { NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 100, ThresholdType: 'PERCENTAGE' },
      { NotificationType: 'FORECASTED', ComparisonOperator: 'GREATER_THAN', Threshold: 100, ThresholdType: 'PERCENTAGE' },
    ])
    for (const each of notifications) {
      expect(each.Subscribers).toHaveLength(1)
      expect(each.Subscribers[0]?.SubscriptionType).toBe('SNS')
      expect(JSON.stringify(each.Subscribers[0]?.Address)).toMatch(/"Ref":"AlarmTopic/)
    }
  })
})

describe('what CloudFormation may do for the alarms', () => {
  const delivery = Template.fromStack(silent.delivery.stack)
  const monitoring = () => JSON.stringify(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-cloudformation-monitoring' } }))

  it('may manage Hold’s topics and subscriptions and Hold’s budgets, and no one else’s', () => {
    const policy = monitoring()
    expect(policy).toContain(`arn:aws:sns:us-east-1:${ACCOUNT}:hold-*`)
    expect(policy).toContain(`arn:aws:budgets::${ACCOUNT}:budget/hold-*`)
    for (const action of ['sns:CreateTopic', 'sns:Subscribe', 'sns:SetTopicAttributes', 'budgets:ModifyBudget', 'budgets:ViewBudget']) expect(policy).toContain(`"${action}"`)
    expect(policy).not.toContain('sns:Publish')
    expect(policy).not.toMatch(/"(sns|budgets):\*"/)
  })

  it('is attached to CloudFormation’s role', () => {
    delivery.hasResourceProperties('AWS::IAM::Role', { RoleName: 'hold-cloudformation-exec', ManagedPolicyArns: Match.arrayWith([{ Ref: Match.stringLikeRegexp('^MonitoringPolicy') }]) })
  })
})
