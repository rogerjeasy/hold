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
  TAGS,
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
  functions: `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${PREFIX}-*`,
  keys: `arn:aws:kms:${REGION}:${ACCOUNT}:key/*`,
  services: `arn:aws:apprunner:${REGION}:${ACCOUNT}:service/${PREFIX}-*`,
  scaling: `arn:aws:apprunner:${REGION}:${ACCOUNT}:autoscalingconfiguration/${PREFIX}-*`,
}
// The only roles CloudFormation may hand on: the web app's two (infra/lib/web-stack.ts), which trust App Runner alone,
// and the code sender's (infra/lib/code-sender.ts), which trusts Lambda alone.
const PASSED_ROLES = [name('web'), name('web', 'access'), name('code', 'sender'), name('worker'), name('comparison'), name('evidence'), name('receipts'), name('scheduler')]
const HOLD_TAG = { 'aws:ResourceTag/project': PREFIX }
const HOLD_REQUEST_TAG = { 'aws:RequestTag/project': PREFIX }

type Conditions = Record<string, Record<string, unknown>>
const statement = (actions: string[], resources: string[], conditions?: Conditions) =>
  new iam.PolicyStatement({ actions, resources, ...(conditions === undefined ? {} : { conditions }) })
const deny = (actions: string[], resources: string[], conditions?: Conditions) =>
  new iam.PolicyStatement({ effect: iam.Effect.DENY, actions, resources, ...(conditions === undefined ? {} : { conditions }) })

// The most any role of Hold's may do, whatever its own policy says: exactly what the app needs and no more. Hold's
// queues to send to and read, objects in its buckets, its secrets to read and the shops' PayPal credentials to keep,
// its database through the Data API, its schedules, its image, sending email, Claude on Bedrock, its own logs,
// putting a person in a group of its user pool, and decrypting with its own keys, as the code sender does. The only role it may hand on is the scheduler's, to the scheduler.
// Nothing here manages IAM, CloudFormation or any resource of another project.
function permissionsBoundary(stack: Stack): iam.ManagedPolicy {
  return new iam.ManagedPolicy(stack, 'PermissionsBoundary', {
    managedPolicyName: PERMISSIONS_BOUNDARY,
    description: "The most any of Hold's roles may do: Hold's own resources, and nothing of other projects",
    statements: [
      statement(['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'], [at.sqs]),
      statement(['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'], [at.objects]),
      statement(['s3:ListBucket'], [at.buckets]),
      // Finding faces to blur in a display copy. The call names no resource.
      statement(['rekognition:DetectFaces'], ['*']),
      statement(['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'], [at.secrets('*')]),
      statement(['secretsmanager:CreateSecret', 'secretsmanager:PutSecretValue', 'secretsmanager:TagResource'], [at.secrets('paypal/*')]),
      statement(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [at.cluster]),
      statement(['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'], [at.schedules]),
      statement(['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'], [at.repository]),
      statement(['ecr:GetAuthorizationToken'], ['*']),
      statement(['ses:SendEmail', 'ses:SendRawEmail'], [`arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`]),
      statement(['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], [`arn:aws:bedrock:${REGION}::foundation-model/*`, `arn:aws:bedrock:*:${ACCOUNT}:inference-profile/*`]),
      statement(['bedrock-mantle:CreateInference'], ['*'], { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } }),
      statement(['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], [
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/apprunner/${PREFIX}-*`,
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${PREFIX}-*`,
        `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/${PREFIX}/*`,
      ]),
      statement(['cloudwatch:PutMetricData'], ['*'], { StringEquals: { 'cloudwatch:namespace': 'Hold' } }),
      statement(['cognito-idp:AdminAddUserToGroup'], [at.userPools], { StringEquals: HOLD_TAG }),
      statement(['kms:Decrypt', 'kms:GenerateDataKey'], ['*'], { StringEquals: { 'kms:ViaService': [`secretsmanager.${REGION}.amazonaws.com`, `sqs.${REGION}.amazonaws.com`] } }),
      statement(['kms:Decrypt', 'kms:GenerateDataKey'], [at.keys], { StringEquals: { 'kms:ViaService': `s3.${REGION}.amazonaws.com`, 'kms:CallerAccount': ACCOUNT, 'kms:EncryptionContext:aws:s3:arn': [`arn:aws:s3:::${name('evidence', ACCOUNT)}`, `arn:aws:s3:::${name('display', ACCOUNT)}`] }, 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/aws/s3' } }),
      statement(['kms:Decrypt'], [at.keys], { StringEquals: HOLD_TAG }),
      statement(['iam:PassRole'], [at.role(name('scheduler'))], { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } }),
      // The scheduler starts the outbox relay, one of Hold's functions.
      statement(['lambda:InvokeFunction'], [at.functions]),
    ],
  })
}

// What CloudFormation needs to run Hold's code: the web app on App Runner, the functions on Lambda with what feeds
// them, and the schedules that start them. Apart from the rest because one role's own policy holds at most 10,240
// characters.
function computePolicy(stack: Stack): iam.ManagedPolicy {
  const policy = new iam.ManagedPolicy(stack, 'ComputePolicy', {
    managedPolicyName: name('cloudformation', 'compute'),
    description: "What CloudFormation needs to run Hold's code, and nothing of other projects",
  })
  const add = (statement: iam.PolicyStatement) => {
    policy.addStatements(statement)
  }
  // The code sender: Hold's functions only, with their code read from Hold's prefix of the bootstrap bucket.
  add(
    statement(
      ['lambda:CreateFunction', 'lambda:DeleteFunction', 'lambda:GetFunction', 'lambda:GetFunctionConfiguration', 'lambda:GetFunctionCodeSigningConfig', 'lambda:GetRuntimeManagementConfig', 'lambda:UpdateFunctionCode', 'lambda:UpdateFunctionConfiguration', 'lambda:AddPermission', 'lambda:RemovePermission', 'lambda:GetPolicy', 'lambda:TagResource', 'lambda:UntagResource', 'lambda:ListTags'],
      [at.functions],
    ),
  )
  add(statement(['s3:GetObject'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}/${CDK_ASSETS_PREFIX}*`]))
  // App Runner: a service may be made only with the project tag, and only Hold's are described or changed after.
  // Describing a service shows its settings, so another project's is never described.
  add(statement(['apprunner:CreateService'], ['*'], { StringEquals: HOLD_REQUEST_TAG }))
  add(statement(['apprunner:DescribeService', 'apprunner:ListOperations', 'apprunner:UpdateService', 'apprunner:DeleteService', 'apprunner:TagResource', 'apprunner:UntagResource', 'apprunner:ListTagsForResource'], [`${at.services}/*`]))
  add(statement(['apprunner:CreateAutoScalingConfiguration', 'apprunner:DescribeAutoScalingConfiguration', 'apprunner:DeleteAutoScalingConfiguration', 'apprunner:TagResource', 'apprunner:UntagResource', 'apprunner:ListTagsForResource'], [`${at.scaling}/*`]))

  // The worker: a queue may feed only one of Hold's functions. A mapping's own ARN is not known before it exists, so the
  // function it feeds is what is checked. The outbox relay's schedule goes in Hold's own groups only.
  add(
    statement(['lambda:CreateEventSourceMapping', 'lambda:UpdateEventSourceMapping', 'lambda:DeleteEventSourceMapping', 'lambda:TagResource'], ['*'], {
      ArnLike: { 'lambda:FunctionArn': at.functions },
    }),
  )
  // CloudFormation tags each mapping it makes with the stack's tags, and tagging one names no function, so the condition
  // above never holds for it. A mapping's ID is unknown until it exists, so the grant names every mapping, and allows
  // only Hold's own two tags with their own values, beside CloudFormation's: nothing else can be written on any mapping.
  add(
    statement(['lambda:TagResource'], [`arn:aws:lambda:${REGION}:${ACCOUNT}:event-source-mapping:*`], {
      StringEquals: Object.fromEntries(Object.entries(TAGS).map(([key, value]) => [`aws:RequestTag/${key}`, value])),
      // CloudFormation adds its own aws:cloudformation tags, which only AWS can write.
      'ForAllValues:StringLike': { 'aws:TagKeys': [...Object.keys(TAGS), 'aws:cloudformation:*'] },
    }),
  )
  add(statement(['lambda:GetEventSourceMapping', 'lambda:ListEventSourceMappings', 'lambda:ListTags'], ['*']))
  add(statement(['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule'], [at.schedules]))
  return policy
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

  // Keys: an administrator makes Hold's, because tagging a key as it is made needs kms:TagResource, which would let
  // this role tag another project's key as Hold's too. Setting one on the user pool makes Cognito's grant on it, so
  // that is all it may do with a key, and only with one tagged as Hold's. The grant can go only to Cognito and only
  // to encrypt, so no grant it makes can let anyone, itself included, decrypt a code.
  add(statement(['kms:DescribeKey'], [at.keys], { StringEquals: HOLD_TAG }))
  add(
    statement(['kms:CreateGrant'], [at.keys], {
      StringEquals: { ...HOLD_TAG, 'kms:GranteePrincipal': `cognito-idp.${REGION}.amazonaws.com` },
      'ForAllValues:StringEquals': { 'kms:GrantOperations': ['Encrypt', 'GenerateDataKey'] },
    }),
  )
  add(deny(['kms:TagResource', 'kms:UntagResource'], ['*'], { 'ForAnyValue:StringEquals': { 'aws:TagKeys': ['project'] } }))

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
  // App Runner checks the pass with a service name of its own choosing, so none is named. The two roles trust App
  // Runner alone, which is what keeps them to it.
  add(statement(['iam:PassRole'], PASSED_ROLES.map(at.role)))
  role.addToPolicy(new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['iam:PassRole'], notResources: PASSED_ROLES.map(at.role) }))
  add(deny(['iam:DeleteRolePermissionsBoundary', 'iam:AttachRolePolicy', 'iam:CreatePolicy', 'iam:CreatePolicyVersion', 'iam:SetDefaultPolicyVersion', 'iam:CreateUser', 'iam:CreateAccessKey'], ['*']))
  // The pipeline's own roles, and the boundary, change only by an administrator's hand.
  add(deny(['iam:*'], [...pipelineRoles.map(at.role), boundary.managedPolicyArn]))
  role.addManagedPolicy(computePolicy(stack))
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

  // Migrations: through the Data API, as the owner, with the database logins' secrets.
  add(statement(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${name('database')}`]))
  add(statement(['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'], ['admin', 'app', 'worker', 'eval'].map((login) => `${at.secrets(`database/${login}`)}-*`)))

  // The comparison's release gate (extensions.md section 5.6): on main, it runs the gate half of the evaluation set
  // through the model and records the run. It moves no money and deploys nothing. A pull request's own code never gets
  // it: the code that runs with these credentials is code already on main.
  const evalRole = new iam.Role(stack, 'EvalRole', {
    roleName: name('github', 'eval'),
    description: `Assumed by the comparison gate on the main branch of ${GITHUB_REPOSITORY}`,
    maxSessionDuration: Duration.hours(1),
    assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': GITHUB_DEPLOY_SUBJECT,
      },
    }),
  })
  // The comparison's model and its fallback only.
  const models = ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8']
  evalRole.addToPolicy(statement(['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], models.flatMap((model) => [`arn:aws:bedrock:${REGION}::foundation-model/${model}*`, `arn:aws:bedrock:*:${ACCOUNT}:inference-profile/*${model}*`])))
  evalRole.addToPolicy(statement(['bedrock-mantle:CreateInference'], ['*'], { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } }))
  evalRole.addToPolicy(statement(['rds-data:ExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${name('database')}`]))
  evalRole.addToPolicy(statement(['secretsmanager:GetSecretValue'], [`${at.secrets('database/eval')}-*`]))

  new CfnOutput(stack, 'EvalRoleArn', { value: evalRole.roleArn })
  new CfnOutput(stack, 'DeployRoleArn', { value: deployRole.roleArn })
  new CfnOutput(stack, 'CloudFormationRoleArn', { value: cloudFormation.roleArn })
  new CfnOutput(stack, 'PermissionsBoundaryArn', { value: boundary.managedPolicyArn })
  return { stack, deployRole, cloudFormationRole: cloudFormation, boundary }
}
