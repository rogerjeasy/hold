import { RemovalPolicy } from 'aws-cdk-lib'
import type { Stack } from 'aws-cdk-lib'
import type * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { PREFIX } from './settings.ts'

// How long CloudWatch keeps what Hold's functions log. A month is enough to look into a fault reported late. No log is
// the only copy of anything a shop or renter relies on: the audit trail, the money log and the approvals are in the
// database (architecture.md section 17.1).
export const LOG_RETENTION = logs.RetentionDays.ONE_MONTH

// CloudFormation may make log groups only once an administrator has deployed HoldDelivery with that grant, so the
// groups are made with "logRetention": "on" in cdk.json, set after that deploy (docs/deploy.md). Until then each
// function logs to the group Lambda makes itself, which never expires.
function managesLogGroups(stack: Stack): boolean {
  return stack.node.tryGetContext('logRetention') === 'on'
}

// A function's own log group, under Hold's prefix, which the permissions boundary already lets a role write to. Lambda
// made /aws/lambda/<name> for each function before Hold managed its groups, so the managed ones take another name
// rather than clash with those.
export function functionLogGroup(stack: Stack, id: string, functionName: string, role: iam.IRole): logs.ILogGroup | undefined {
  if (!managesLogGroups(stack)) return undefined
  const group = new logs.LogGroup(stack, `${id}Logs`, { logGroupName: `/${PREFIX}/lambda/${functionName}`, retention: LOG_RETENTION, removalPolicy: RemovalPolicy.DESTROY })
  group.grantWrite(role)
  return group
}
