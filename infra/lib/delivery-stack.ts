import { CfnOutput, Duration, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { ACCOUNT, CDK_BOOTSTRAP_QUALIFIER, GITHUB_REPOSITORY, name, REGION, secretName } from './settings.ts'

// How GitHub Actions reaches the account (tech-stack.md section 12): through OpenID Connect, with no AWS key stored
// in GitHub. The identity provider is the account's, already shared with the other projects, so it is referred to,
// not created: an account can hold only one provider for GitHub.

export type DeliveryResources = { readonly stack: Stack; readonly deployRole: iam.Role }

export function createDeliveryStack(app: App, props: StackProps): DeliveryResources {
  const stack = new Stack(app, 'HoldDelivery', { ...props, description: 'Hold: the role GitHub Actions deploys with' })
  const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
    stack,
    'GitHub',
    `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`,
  )

  const deployRole = new iam.Role(stack, 'DeployRole', {
    roleName: name('github', 'deploy'),
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

  // Deploying: the bootstrap's own roles do the work, so this role needs only to take them.
  deployRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(
        (kind) => `arn:aws:iam::${ACCOUNT}:role/cdk-${CDK_BOOTSTRAP_QUALIFIER}-${kind}-role-${ACCOUNT}-${REGION}`,
      ),
    }),
  )

  // The image: pushed to Hold's repository only.
  deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }))
  deployRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:CompleteLayerUpload',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
      ],
      resources: [`arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${name('app')}`],
    }),
  )

  // Migrations: through the Data API, as the owner, with the two database logins' secrets.
  deployRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'],
      resources: [`arn:aws:rds:${REGION}:${ACCOUNT}:cluster:${name('database')}`],
    }),
  )
  deployRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      resources: ['admin', 'app'].map((login) => `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${secretName('database', login)}-*`),
    }),
  )

  new CfnOutput(stack, 'DeployRoleArn', { value: deployRole.roleArn })
  return { stack, deployRole }
}
