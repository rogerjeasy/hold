import { CfnOutput, Duration, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import {
  ACCOUNT,
  CDK_ASSETS_BUCKET,
  CDK_ASSETS_PREFIX,
  GITHUB_DEPLOY_SUBJECT,
  GITHUB_REPOSITORY,
  name,
  PERMISSIONS_BOUNDARY,
  PIPELINE_STACKS,
  PREFIX,
  REGION,
} from './settings.ts'

// How GitHub Actions reaches the account (tech-stack.md section 12): through OpenID Connect, with no AWS key stored
// in GitHub. The account is shared with other projects, so nothing here can reach beyond Hold.
//
// - The deploy role may change only Hold's resource stacks (PIPELINE_STACKS), and hands CloudFormation one role of
//   Hold's own to do it. It never takes the account's CDK bootstrap roles, which could deploy any stack.
// - That CloudFormation role manages only Hold's resources, and reads none of their contents: no object, message,
//   user or credential, except the database logins' secrets, which wiring the cluster needs.
// - Every role it makes carries the permissions boundary below, which it can neither change nor remove, so no role
//   it makes can reach beyond Hold either.
// - Security groups and user pools carry no name in their ARN, so they are reached by the project tag, which may be
//   set only when they are created and never changed after.
// - This stack, which holds all of the above, is deployed only by an administrator, never by the pipeline.
// The identity provider is the account's, already shared, so it is referred to, not created.

export type DeliveryResources = {
  readonly stack: Stack
  readonly deployRole: iam.Role
  readonly cloudFormationRole: iam.Role
  readonly boundary: iam.ManagedPolicy
}

const at = {
  stack: (stackName: string) => `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${stackName}/*`,
  role: (roleName: string) => `arn:aws:iam::${ACCOUNT}:role/${roleName}`,
  sqs: `arn:aws:sqs:${REGION}:${ACCOUNT}:${PREFIX}-*`,
  buckets: `arn:aws:s3:::${PREFIX}-*`,
  objects: `arn:aws:s3:::${PREFIX}-*/*`,
  secrets: (path: string) => `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${PREFIX}/${path}`,
  cluster: `arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${PREFIX}-*`,
  repository: `arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${PREFIX}-*`,
  scheduleGroup: `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule-group/${PREFIX}-*`,
  schedules: `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${PREFIX}-*/*`,
  userPools: `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/*`,
  services: `arn:aws:apprunner:${REGION}:${ACCOUNT}:service/${PREFIX}-*`,
  scaling: `arn:aws:apprunner:${REGION}:${ACCOUNT}:autoscalingconfiguration/${PREFIX}-*`,
}
// The web app's two roles (infra/lib/web-stack.ts), the only ones CloudFormation may hand on, and only to App Runner.
const WEB_ROLES = [name('web'), name('web', 'access')]
const HOLD_TAG = { 'aws:ResourceTag/project': PREFIX }
const HOLD_REQUEST_TAG = { 'aws:RequestTag/project': PREFIX }

type Conditions = Record<string, Record<string, unknown>>
const statement = (actions: string[], resources: string[], conditions?: Conditions) =>
  new iam.PolicyStatement({ actions, resources, ...(conditions === undefined ? {} : { conditions }) })
const deny = (actions: string[], resources: string[], conditions?: Conditions) =>
  new iam.PolicyStatement({ effect: iam.Effect.DENY, actions, resources, ...(conditions === undefined ? {} : { conditions }) })

// The most any role of Hold's may do, whatever its own policy says: exactly what the app needs and no more. Hold's
// queues to send to and read, objects in its buckets, its secrets to read and the shops' PayPal credentials to keep,
// its database through the Data API, its schedules, its image, sending email, Claude on Bedrock, its own logs, and
// putting a person in a group of its user pool. The only role it may hand on is the scheduler's, to the scheduler.
// Nothing here manages IAM, CloudFormation or any resource of another project.
function permissionsBoundary(stack: Stack): iam.ManagedPolicy {
  return new iam.ManagedPolicy(stack, 'PermissionsBoundary', {
    managedPolicyName: PERMISSIONS_BOUNDARY,
    description: "The most any of Hold's roles may do: Hold's own resources, and nothing of other projects",
    statements: [
      statement(['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'], [at.sqs]),
      statement(['s3:GetObject', 's3:PutObject'], [at.objects]),
      statement(['s3:ListBucket'], [at.buckets]),
      statement(['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'], [at.secrets('*')]),
      statement(['secretsmanager:CreateSecret', 'secretsmanager:PutSecretValue', 'secretsmanager:TagResource'], [at.secrets('paypal/*')]),
      statement(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [at.cluster]),
      statement(['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'], [at.schedules]),
      statement(['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'], [at.repository]),
      statement(['ecr:GetAuthorizationToken'], ['*']),
      statement(['ses:SendEmail', 'ses:SendRawEmail'], [`arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`]),
      statement(['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], [`arn:aws:bedrock:${REGION}::foundation-model/*`, `arn:aws:bedrock:*:${ACCOUNT}:inference-profile/*`]),
      statement(['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], [
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/apprunner/${PREFIX}-*`,
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${PREFIX}-*`,
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/${PREFIX}/*`,
      ]),
      statement(['cloudwatch:PutMetricData'], ['*'], { StringEquals: { 'cloudwatch:namespace': 'Hold' } }),
      statement(['cognito-idp:AdminAddUserToGroup'], [at.userPools], { StringEquals: HOLD_TAG }),
      statement(['kms:Decrypt', 'kms:GenerateDataKey'], ['*'], { StringEquals: { 'kms:ViaService': [`secretsmanager.${REGION}.amazonaws.com`, `s3.${REGION}.amazonaws.com`, `sqs.${REGION}.amazonaws.com`] } }),
      statement(['iam:PassRole'], [at.role(name('scheduler'))], { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } }),
    ],
  })
}

function cloudFormationRole(stack: Stack, boundary: iam.ManagedPolicy, pipelineRoles: readonly string[]): iam.Role {
  const role = new iam.Role(stack, 'CloudFormationRole', {
    roleName: name('cloudformation', 'exec'),
    description: "CloudFormation deploys Hold's resource stacks with this, and reaches nothing of other projects",
    assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
  })
  const add = (policy: iam.PolicyStatement) => role.addToPolicy(policy)

  // Reading configuration is not a risk, and several services describe only account-wide.
  add(statement(['ec2:Describe*', 'rds:Describe*', 'apprunner:ListServices', 'apprunner:ListAutoScalingConfigurations', 'cloudwatch:DescribeAlarms', 'cognito-idp:DescribeUserPool', 'cognito-idp:DescribeUserPoolClient', 'cognito-idp:GetGroup', 'cognito-idp:GetUserPoolMfaConfig', 'cognito-idp:ListUserPoolClients', 'cognito-idp:ListGroups', 'cognito-idp:ListTagsForResource', 'secretsmanager:GetRandomPassword'], ['*']))
  add(statement(['ssm:GetParameters'], [`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/cdk-bootstrap/*`]))

  // Managing Hold's resources, without reading what they hold.
  add(statement(['sqs:CreateQueue', 'sqs:DeleteQueue', 'sqs:GetQueueAttributes', 'sqs:SetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:TagQueue', 'sqs:UntagQueue', 'sqs:ListQueueTags'], [at.sqs]))
  add(statement(['s3:CreateBucket', 's3:DeleteBucket', 's3:ListBucket', 's3:GetBucket*', 's3:PutBucket*', 's3:DeleteBucketPolicy', 's3:GetEncryptionConfiguration', 's3:PutEncryptionConfiguration', 's3:GetLifecycleConfiguration', 's3:PutLifecycleConfiguration', 's3:GetAccelerateConfiguration', 's3:GetReplicationConfiguration', 's3:GetAnalyticsConfiguration', 's3:GetIntelligentTieringConfiguration', 's3:GetInventoryConfiguration', 's3:GetMetricsConfiguration'], [at.buckets]))
  add(statement(['secretsmanager:CreateSecret', 'secretsmanager:DeleteSecret', 'secretsmanager:DescribeSecret', 'secretsmanager:UpdateSecret', 'secretsmanager:TagResource', 'secretsmanager:UntagResource', 'secretsmanager:GetResourcePolicy', 'secretsmanager:PutResourcePolicy', 'secretsmanager:DeleteResourcePolicy'], [at.secrets('database/*'), at.secrets('web/*')]))
  // Attaching the cluster to its login writes the host into the secret, so only the database logins are readable.
  add(statement(['secretsmanager:GetSecretValue', 'secretsmanager:PutSecretValue'], [at.secrets('database/*')]))
  add(statement(['ecr:CreateRepository', 'ecr:DeleteRepository', 'ecr:DescribeRepositories', 'ecr:PutLifecyclePolicy', 'ecr:GetLifecyclePolicy', 'ecr:DeleteLifecyclePolicy', 'ecr:PutImageScanningConfiguration', 'ecr:PutImageTagMutability', 'ecr:SetRepositoryPolicy', 'ecr:GetRepositoryPolicy', 'ecr:DeleteRepositoryPolicy', 'ecr:TagResource', 'ecr:UntagResource', 'ecr:ListTagsForResource'], [at.repository]))
  add(statement(['cloudwatch:PutMetricAlarm', 'cloudwatch:DeleteAlarms', 'cloudwatch:TagResource', 'cloudwatch:UntagResource', 'cloudwatch:ListTagsForResource'], [`arn:aws:cloudwatch:${REGION}:${ACCOUNT}:alarm:${PREFIX}-*`]))
  add(statement(['scheduler:CreateScheduleGroup', 'scheduler:DeleteScheduleGroup', 'scheduler:GetScheduleGroup', 'scheduler:TagResource', 'scheduler:UntagResource', 'scheduler:ListTagsForResource'], [at.scheduleGroup]))
  add(
    statement(['rds:CreateDBCluster', 'rds:ModifyDBCluster', 'rds:DeleteDBCluster', 'rds:CreateDBInstance', 'rds:ModifyDBInstance', 'rds:DeleteDBInstance', 'rds:CreateDBSubnetGroup', 'rds:ModifyDBSubnetGroup', 'rds:DeleteDBSubnetGroup', 'rds:EnableHttpEndpoint', 'rds:DisableHttpEndpoint', 'rds:AddTagsToResource', 'rds:RemoveTagsFromResource', 'rds:ListTagsForResource'], [
      at.cluster,
      `arn:aws:rds:${REGION}:${ACCOUNT}:db:${PREFIX}-*`,
      `arn:aws:rds:${REGION}:${ACCOUNT}:subgrp:holddata-*`,
    ]),
  )
  // A cluster names the account's default parameter and option groups. Naming them is all it may do with them.
  add(statement(['rds:CreateDBCluster', 'rds:ModifyDBCluster', 'rds:CreateDBInstance', 'rds:ModifyDBInstance'], [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster-pg:default*`, `arn:aws:rds:${REGION}:${ACCOUNT}:pg:default*`, `arn:aws:rds:${REGION}:${ACCOUNT}:og:default*`]))
  // Encryption with AWS-managed keys, through the services that use them, for their own resources only.
  add(statement(['kms:DescribeKey', 'kms:CreateGrant'], ['*'], { StringEquals: { 'kms:ViaService': [`rds.${REGION}.amazonaws.com`, `secretsmanager.${REGION}.amazonaws.com`] }, Bool: { 'kms:GrantIsForAWSResource': true } }))

  // App Runner: a service may be made only with the project tag, and only Hold's are described or changed after.
  // Describing a service shows its settings, so another project's is never described.
  add(statement(['apprunner:CreateService'], ['*'], { StringEquals: HOLD_REQUEST_TAG }))
  add(statement(['apprunner:DescribeService', 'apprunner:ListOperations', 'apprunner:UpdateService', 'apprunner:DeleteService', 'apprunner:TagResource', 'apprunner:UntagResource', 'apprunner:ListTagsForResource'], [`${at.services}/*`]))
  add(statement(['apprunner:CreateAutoScalingConfiguration', 'apprunner:DescribeAutoScalingConfiguration', 'apprunner:DeleteAutoScalingConfiguration', 'apprunner:TagResource', 'apprunner:UntagResource', 'apprunner:ListTagsForResource'], [`${at.scaling}/*`]))

  // Security groups: the project tag may be set only while one is created, and never changed after, so a group of
  // another project cannot be brought into reach by tagging it.
  add(statement(['ec2:CreateSecurityGroup'], [`arn:aws:ec2:${REGION}:${ACCOUNT}:vpc/*`]))
  add(statement(['ec2:CreateSecurityGroup'], [`arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/*`], { StringEquals: HOLD_REQUEST_TAG }))
  add(statement(['ec2:CreateTags'], [`arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/*`], { StringEquals: { 'ec2:CreateAction': 'CreateSecurityGroup' } }))
  add(
    statement(
      ['ec2:AuthorizeSecurityGroupIngress', 'ec2:AuthorizeSecurityGroupEgress', 'ec2:RevokeSecurityGroupIngress', 'ec2:RevokeSecurityGroupEgress', 'ec2:DeleteSecurityGroup', 'ec2:ModifySecurityGroupRules', 'ec2:UpdateSecurityGroupRuleDescriptionsIngress', 'ec2:UpdateSecurityGroupRuleDescriptionsEgress', 'ec2:CreateTags', 'ec2:DeleteTags'],
      [`arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/*`],
      { StringEquals: HOLD_TAG },
    ),
  )
  add(deny(['ec2:CreateTags', 'ec2:DeleteTags'], ['*'], { 'ForAnyValue:StringEquals': { 'aws:TagKeys': ['project'] }, StringNotEquals: { 'ec2:CreateAction': 'CreateSecurityGroup' } }))

  // User pools: the same rule for the project tag, and only the actions that configure a pool, never one that acts
  // on a person's account.
  add(statement(['cognito-idp:CreateUserPool'], ['*'], { StringEquals: HOLD_REQUEST_TAG }))
  add(
    statement(
      ['cognito-idp:UpdateUserPool', 'cognito-idp:DeleteUserPool', 'cognito-idp:SetUserPoolMfaConfig', 'cognito-idp:CreateUserPoolClient', 'cognito-idp:UpdateUserPoolClient', 'cognito-idp:DeleteUserPoolClient', 'cognito-idp:CreateGroup', 'cognito-idp:UpdateGroup', 'cognito-idp:DeleteGroup', 'cognito-idp:TagResource', 'cognito-idp:UntagResource'],
      [at.userPools],
      { StringEquals: HOLD_TAG },
    ),
  )
  add(deny(['cognito-idp:TagResource', 'cognito-idp:UntagResource'], ['*'], { 'ForAnyValue:StringEquals': { 'aws:TagKeys': ['project'] } }))

  // Roles: only Hold's, created with the project tag and the boundary, and changed only while they carry both. The
  // boundary can never be taken off, the project tag never changed, and no role handed on but the web app's two.
  const withBoundary = { 'iam:PermissionsBoundary': boundary.managedPolicyArn }
  add(statement(['iam:CreateRole'], [at.role(`${PREFIX}-*`)], { StringEquals: { ...withBoundary, ...HOLD_REQUEST_TAG } }))
  add(statement(['iam:TagRole'], [at.role(`${PREFIX}-*`)], { StringEquals: HOLD_REQUEST_TAG }))
  add(statement(['iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:PutRolePermissionsBoundary'], [at.role(`${PREFIX}-*`)], { StringEquals: { ...withBoundary, ...HOLD_TAG } }))
  add(statement(['iam:DeleteRole', 'iam:UpdateRole', 'iam:UpdateAssumeRolePolicy', 'iam:TagRole', 'iam:UntagRole'], [at.role(`${PREFIX}-*`)], { StringEquals: HOLD_TAG }))
  add(statement(['iam:GetRole', 'iam:GetRolePolicy', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies', 'iam:ListRoleTags'], [at.role(`${PREFIX}-*`)]))
  add(deny(['iam:UntagRole'], ['*'], { 'ForAnyValue:StringEquals': { 'aws:TagKeys': ['project'] } }))
  add(
    statement(['iam:PassRole'], WEB_ROLES.map(at.role), {
      StringEquals: { 'iam:PassedToService': ['apprunner.amazonaws.com', 'build.apprunner.amazonaws.com', 'tasks.apprunner.amazonaws.com'] },
    }),
  )
  role.addToPolicy(new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['iam:PassRole'], notResources: WEB_ROLES.map(at.role) }))
  add(deny(['iam:DeleteRolePermissionsBoundary', 'iam:AttachRolePolicy', 'iam:CreatePolicy', 'iam:CreatePolicyVersion', 'iam:SetDefaultPolicyVersion', 'iam:CreateUser', 'iam:CreateAccessKey'], ['*']))
  // The pipeline's own roles, and the boundary, change only by an administrator's hand.
  add(deny(['iam:*'], [...pipelineRoles.map(at.role), boundary.managedPolicyArn]))
  return role
}

export function createDeliveryStack(app: App, props: StackProps): DeliveryResources {
  const stack = new Stack(app, 'HoldDelivery', { ...props, description: 'Hold: the roles GitHub Actions deploys with' })
  const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(stack, 'GitHub', `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`)

  const deployRoleName = name('github', 'deploy')
  const cloudFormationRoleName = name('cloudformation', 'exec')
  const boundary = permissionsBoundary(stack)
  const cloudFormation = cloudFormationRole(stack, boundary, [deployRoleName, cloudFormationRoleName])

  const deployRole = new iam.Role(stack, 'DeployRole', {
    roleName: deployRoleName,
    description: `Assumed by GitHub Actions on the main branch of ${GITHUB_REPOSITORY}`,
    maxSessionDuration: Duration.hours(1),
    // Only a workflow on the main branch of Hold's own repository, named by its immutable ids.
    assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': GITHUB_DEPLOY_SUBJECT,
      },
    }),
  })
  const add = (policy: iam.PolicyStatement) => deployRole.addToPolicy(policy)

  // The resource stacks only, through change sets that CloudFormation carries out as Hold's own role.
  add(statement(['cloudformation:CreateChangeSet', 'cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet', 'cloudformation:DescribeStacks', 'cloudformation:DescribeStackEvents', 'cloudformation:DescribeStackResources', 'cloudformation:GetTemplate', 'cloudformation:ListStackResources'], PIPELINE_STACKS.map(at.stack)))
  add(statement(['iam:PassRole'], [cloudFormation.roleArn], { StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' } }))
  // Templates go to the bootstrap bucket, under Hold's own prefix only, and only that prefix can be listed.
  add(statement(['s3:GetObject', 's3:PutObject'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}/${CDK_ASSETS_PREFIX}*`]))
  add(statement(['s3:ListBucket'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}`], { StringLike: { 's3:prefix': [`${CDK_ASSETS_PREFIX}*`] } }))
  add(statement(['s3:GetBucketLocation'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}`]))

  // The image: pushed to Hold's repository only.
  add(statement(['ecr:GetAuthorizationToken'], ['*']))
  add(statement(['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:CompleteLayerUpload', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'], [`arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${name('app')}`]))

  // Migrations: through the Data API, as the owner, with the two database logins' secrets.
  add(statement(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${name('database')}`]))
  add(statement(['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'], ['admin', 'app'].map((login) => `${at.secrets(`database/${login}`)}-*`)))

  new CfnOutput(stack, 'DeployRoleArn', { value: deployRole.roleArn })
  new CfnOutput(stack, 'CloudFormationRoleArn', { value: cloudFormation.roleArn })
  new CfnOutput(stack, 'PermissionsBoundaryArn', { value: boundary.managedPolicyArn })
  return { stack, deployRole, cloudFormationRole: cloudFormation, boundary }
}
