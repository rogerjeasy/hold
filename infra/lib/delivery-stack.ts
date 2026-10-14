import { CfnOutput, Duration, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { ACCOUNT, CDK_ASSETS_BUCKET, CDK_ASSETS_PREFIX, GITHUB_REPOSITORY, name, PIPELINE_STACKS, PREFIX, REGION, TAGS } from './settings.ts'

// How GitHub Actions reaches the account (tech-stack.md section 12): through OpenID Connect, with no AWS key stored
// in GitHub. The account is shared with other projects, so nothing here can reach beyond Hold.
//
// - The deploy role may change only Hold's resource stacks (PIPELINE_STACKS), and hands CloudFormation one role of
//   Hold's own to do it. It never takes the account's CDK bootstrap roles, which could deploy any stack.
// - That CloudFormation role reaches only Hold's resources: by name where the service has names, by the project tag
//   where it has none.
// - This stack, which holds both roles, is deployed only by an administrator, never by the pipeline, so a change
//   on main cannot widen what the pipeline may do.
// The identity provider is the account's, already shared, so it is referred to, not created.

export type DeliveryResources = { readonly stack: Stack; readonly deployRole: iam.Role; readonly cloudFormationRole: iam.Role }

const arn = {
  stack: (stackName: string) => `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${stackName}/*`,
  role: (roleName: string) => `arn:aws:iam::${ACCOUNT}:role/${roleName}`,
}
const HOLD_TAG = { 'aws:ResourceTag/project': TAGS['project'] ?? PREFIX }
const HOLD_REQUEST_TAG = { 'aws:RequestTag/project': TAGS['project'] ?? PREFIX }

function cloudFormationRole(stack: Stack, protectedRoles: readonly string[]): iam.Role {
  const role = new iam.Role(stack, 'CloudFormationRole', {
    roleName: name('cloudformation', 'exec'),
    description: "CloudFormation deploys Hold's resource stacks with this, and reaches nothing of other projects",
    assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
  })
  const allow = (actions: string[], resources: string[], conditions?: Record<string, Record<string, unknown>>) =>
    role.addToPolicy(new iam.PolicyStatement({ actions, resources, ...(conditions === undefined ? {} : { conditions }) }))

  // Reading is not a risk, and several services list or describe only account-wide.
  allow(['ec2:Describe*', 'rds:Describe*', 'cloudwatch:DescribeAlarms', 'cognito-idp:Describe*', 'cognito-idp:List*', 'secretsmanager:GetRandomPassword'], ['*'])
  allow(['ssm:GetParameters'], [`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/cdk-bootstrap/*`])

  allow(['s3:*'], [`arn:aws:s3:::${PREFIX}-*`, `arn:aws:s3:::${PREFIX}-*/*`])
  allow(['sqs:*'], [`arn:aws:sqs:${REGION}:${ACCOUNT}:${PREFIX}-*`])
  allow(['secretsmanager:*'], [`arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${PREFIX}/*`])
  allow(['ecr:*'], [`arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${PREFIX}-*`])
  allow(['cloudwatch:PutMetricAlarm', 'cloudwatch:DeleteAlarms', 'cloudwatch:TagResource', 'cloudwatch:UntagResource', 'cloudwatch:ListTagsForResource'], [
    `arn:aws:cloudwatch:${REGION}:${ACCOUNT}:alarm:${PREFIX}-*`,
  ])
  allow(['scheduler:*'], [`arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule-group/${PREFIX}-*`, `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${PREFIX}-*/*`])
  // The cluster, its writer, and the subnet group CloudFormation names after the stack. The default parameter and
  // option groups are only referred to.
  allow(['rds:*'], [
    `arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${PREFIX}-*`,
    `arn:aws:rds:${REGION}:${ACCOUNT}:db:${PREFIX}-*`,
    `arn:aws:rds:${REGION}:${ACCOUNT}:subgrp:holddata-*`,
    `arn:aws:rds:${REGION}:${ACCOUNT}:cluster-pg:default*`,
    `arn:aws:rds:${REGION}:${ACCOUNT}:pg:default*`,
    `arn:aws:rds:${REGION}:${ACCOUNT}:og:default*`,
  ])
  allow(['kms:DescribeKey', 'kms:CreateGrant'], ['*'], { StringEquals: { 'kms:ViaService': [`rds.${REGION}.amazonaws.com`, `secretsmanager.${REGION}.amazonaws.com`] } })
  // Security groups and user pools carry no name in their ARN, so they are reached by the project tag.
  allow(['ec2:CreateSecurityGroup'], [`arn:aws:ec2:${REGION}:${ACCOUNT}:vpc/*`])
  allow(['ec2:CreateSecurityGroup', 'ec2:CreateTags'], [`arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/*`], { StringEquals: HOLD_REQUEST_TAG })
  allow(
    ['ec2:AuthorizeSecurityGroupIngress', 'ec2:AuthorizeSecurityGroupEgress', 'ec2:RevokeSecurityGroupIngress', 'ec2:RevokeSecurityGroupEgress', 'ec2:DeleteSecurityGroup', 'ec2:CreateTags', 'ec2:DeleteTags', 'ec2:ModifySecurityGroupRules', 'ec2:UpdateSecurityGroupRuleDescriptionsIngress', 'ec2:UpdateSecurityGroupRuleDescriptionsEgress'],
    [`arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/*`],
    { StringEquals: HOLD_TAG },
  )
  allow(['cognito-idp:CreateUserPool'], ['*'], { StringEquals: HOLD_REQUEST_TAG })
  allow(['cognito-idp:*'], [`arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/*`], { StringEquals: HOLD_TAG })
  // Roles named for Hold, except the two that run the pipeline: they change only by an administrator's hand.
  allow(
    ['iam:CreateRole', 'iam:DeleteRole', 'iam:GetRole', 'iam:UpdateRole', 'iam:UpdateAssumeRolePolicy', 'iam:TagRole', 'iam:UntagRole', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:GetRolePolicy', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies', 'iam:ListRoleTags'],
    [arn.role(`${PREFIX}-*`)],
  )
  role.addToPolicy(new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['iam:*'], resources: protectedRoles.map(arn.role) }))
  return role
}

export function createDeliveryStack(app: App, props: StackProps): DeliveryResources {
  const stack = new Stack(app, 'HoldDelivery', { ...props, description: 'Hold: the roles GitHub Actions deploys with' })
  const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(stack, 'GitHub', `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`)

  const deployRoleName = name('github', 'deploy')
  const cloudFormation = cloudFormationRole(stack, [deployRoleName, name('cloudformation', 'exec')])

  const deployRole = new iam.Role(stack, 'DeployRole', {
    roleName: deployRoleName,
    description: `Assumed by GitHub Actions on the main branch of ${GITHUB_REPOSITORY}`,
    maxSessionDuration: Duration.hours(1),
    // Only a workflow on the main branch of Hold's own repository. A pull request or a fork gets nothing.
    assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPOSITORY}:ref:refs/heads/main`,
      },
    }),
  })
  const allow = (actions: string[], resources: string[], conditions?: Record<string, Record<string, unknown>>) =>
    deployRole.addToPolicy(new iam.PolicyStatement({ actions, resources, ...(conditions === undefined ? {} : { conditions }) }))

  // The resource stacks only, through change sets that CloudFormation carries out as Hold's own role.
  allow(
    ['cloudformation:CreateChangeSet', 'cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet', 'cloudformation:DescribeStacks', 'cloudformation:DescribeStackEvents', 'cloudformation:DescribeStackResources', 'cloudformation:GetTemplate', 'cloudformation:ListStackResources'],
    PIPELINE_STACKS.map(arn.stack),
  )
  allow(['cloudformation:ValidateTemplate', 'cloudformation:GetTemplateSummary'], ['*'])
  allow(['iam:PassRole'], [cloudFormation.roleArn], { StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' } })
  // Templates go to the bootstrap bucket, under Hold's own prefix only.
  allow(['s3:GetObject', 's3:PutObject'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}/${CDK_ASSETS_PREFIX}*`])
  allow(['s3:ListBucket', 's3:GetBucketLocation'], [`arn:aws:s3:::${CDK_ASSETS_BUCKET}`])
  allow(['ssm:GetParameter', 'ssm:GetParameters'], [`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/cdk-bootstrap/*`])

  // The image: pushed to Hold's repository only.
  allow(['ecr:GetAuthorizationToken'], ['*'])
  allow(['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:CompleteLayerUpload', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'], [
    `arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${name('app')}`,
  ])

  // Migrations: through the Data API, as the owner, with the two database logins' secrets.
  allow(['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'], [
    `arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${name('database')}`,
  ])
  allow(['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'], ['admin', 'app'].map((login) => `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${PREFIX}/database/${login}-*`))

  new CfnOutput(stack, 'DeployRoleArn', { value: deployRole.roleArn })
  new CfnOutput(stack, 'CloudFormationRoleArn', { value: cloudFormation.roleArn })
  return { stack, deployRole, cloudFormationRole: cloudFormation }
}
