import type { Stack } from 'aws-cdk-lib'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import type * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { ACCOUNT, name, REGION } from './settings.ts'

// Telling a person when Hold fails (architecture.md section 17.1). Every alarm and the budget report to one topic. The
// address it emails comes from the deploy, never from a committed file, and without one the topic has no subscriber:
// the alarms still change state where CloudWatch shows them.
export function createAlarmTopic(stack: Stack, email: string | undefined): sns.Topic {
  const topic = new sns.Topic(stack, 'AlarmTopic', { topicName: name('alarms'), enforceSSL: true })
  // A topic policy of its own replaces SNS's default, so the two services that publish here are named. Each may publish
  // only for this account, CloudWatch only for Hold's alarms.
  const publishes = (service: string, sourceArn: string) =>
    new iam.PolicyStatement({ actions: ['sns:Publish'], principals: [new iam.ServicePrincipal(service)], resources: [topic.topicArn], conditions: { StringEquals: { 'aws:SourceAccount': ACCOUNT }, ArnLike: { 'aws:SourceArn': sourceArn } } })
  topic.addToResourcePolicy(publishes('cloudwatch.amazonaws.com', `arn:aws:cloudwatch:${REGION}:${ACCOUNT}:alarm:${name('*')}`))
  topic.addToResourcePolicy(publishes('budgets.amazonaws.com', `arn:aws:budgets::${ACCOUNT}:*`))
  if (email !== undefined) topic.addSubscription(new subscriptions.EmailSubscription(email))
  return topic
}

// Both ways: when it goes off, and when it clears, so a person knows the fault is over without looking.
export function reportTo(topic: sns.ITopic, alarm: cloudwatch.Alarm): void {
  const action = new actions.SnsAction(topic)
  alarm.addAlarmAction(action)
  alarm.addOkAction(action)
}

// The account's cost each month. It is the whole account's, the other projects' included: a budget limited to Hold's
// tag would read nothing until an administrator activated the tag for cost allocation, and a silent budget is worse
// than a broad one.
export function createMonthlyBudget(stack: Stack, topic: sns.Topic, amountUsd: number): void {
  const toTopic = (notificationType: 'ACTUAL' | 'FORECASTED', threshold: number) => ({
    notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' },
    subscribers: [{ subscriptionType: 'SNS', address: topic.topicArn }],
  })
  const budget = new budgets.CfnBudget(stack, 'MonthlyBudget', {
    budget: { budgetName: name('account', 'monthly'), budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: amountUsd, unit: 'USD' } },
    // A warning with time to act, the line itself, and a forecast that sees the line coming before it is crossed.
    notificationsWithSubscribers: [toTopic('ACTUAL', 80), toTopic('ACTUAL', 100), toTopic('FORECASTED', 100)],
  })
  // Budgets checks that it may publish to the topic when the budget is made, so the topic's policy comes first.
  budget.node.addDependency(topic)
}
