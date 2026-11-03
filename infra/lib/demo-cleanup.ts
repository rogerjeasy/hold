import type { Stack } from 'aws-cdk-lib'
import type * as cognito from 'aws-cdk-lib/aws-cognito'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
import { DATABASE_NAME, name } from './settings.ts'
import { workerFunction } from './worker.ts'
import type { WorkerProps } from './worker.ts'

// The daily demo cleanup (architecture.md section 20.3): each demo older than a week loses its two Cognito users and
// its shop is marked retired. Its role may use the database as hold_worker and delete a user in Hold's user pool, and
// nothing else: no PayPal credential, no queue, no model. No other role of Hold's may delete a user.
export function createDemoCleanup(stack: Stack, props: WorkerProps & { readonly userPool: cognito.IUserPool }): void {
  const role = new iam.Role(stack, 'DemoCleanupRole', { roleName: name('demo', 'cleanup'), description: 'Hold demo cleanup: removes the users of demos older than a week and marks their shops retired', assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], resources: [props.cluster.clusterArn] }))
  props.workerUserSecret.grantRead(role)
  role.addToPolicy(new iam.PolicyStatement({ actions: ['cognito-idp:AdminDeleteUser'], resources: [props.userPool.userPoolArn] }))
  const functionName = name('worker', 'demo', 'cleanup')
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], resources: [`arn:aws:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/${functionName}*:*`] }))
  const cleanup = workerFunction(stack, 'DemoCleanup', functionName, 'demo-cleanup-lambda.ts', role, {
    HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
    HOLD_DATABASE_SECRET_ARN: props.workerUserSecret.secretArn,
    HOLD_DATABASE_NAME: DATABASE_NAME,
    HOLD_USER_POOL_ID: props.userPool.userPoolId,
  })
  cleanup.grantInvoke(props.schedulerRole)
  new scheduler.CfnSchedule(stack, 'DemoCleanupSchedule', {
    name: name('demo', 'cleanup'),
    groupName: props.scheduleGroup.scheduleGroupName,
    description: 'Retires each demo older than a week and removes its two users',
    // After the nightly operations run, in the quiet of every judge's night.
    scheduleExpression: 'cron(30 3 * * ? *)',
    flexibleTimeWindow: { mode: 'OFF' },
    target: { arn: cleanup.functionArn, roleArn: props.schedulerRole.roleArn, retryPolicy: { maximumRetryAttempts: 2 } },
  })
}
