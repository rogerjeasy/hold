import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'
import { DATABASE_NAME, EVIDENCE_RETENTION_DAYS, PREFIX } from './settings.ts'
import { QUEUES } from './work-stack.ts'

// The default VPC lookup recorded by the first synth, so the tests build the same app with no AWS access.
const context = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>

const IMAGE_TAG = '0123456789abcdef0123456789abcdef01234567'
const stacks = createHoldApp(new App({ context }), {
  senderEmail: 'codes@example.com',
  passkeyRelyingPartyId: 'localhost',
  webImageTag: IMAGE_TAG,
  webPublicUrl: 'https://abc123.us-east-1.awsapprunner.com',
})
const data = Template.fromStack(stacks.data.stack)
const identity = Template.fromStack(stacks.identity.stack)
const work = Template.fromStack(stacks.work.stack)
const registry = Template.fromStack(stacks.registry.stack)
const web = Template.fromStack(stacks.web.stack)
const delivery = Template.fromStack(stacks.delivery.stack)
const all = [data, identity, work, registry, web, delivery]

// Resource types whose names live inside another Hold resource, such as a group inside Hold's own user pool.
// Their names cannot meet another project's, so they need no prefix.
const SCOPED_TYPES: ReadonlySet<string> = new Set(['AWS::Cognito::UserPoolGroup'])

// Every property that names a resource, in every template.
const NAME_PROPERTIES = [
  'BucketName',
  'DBClusterIdentifier',
  'DBInstanceIdentifier',
  'GroupName',
  'QueueName',
  'RoleName',
  'UserPoolName',
  'ClientName',
  'RepositoryName',
  'AlarmName',
  'Name',
  'ServiceName',
  'AutoScalingConfigurationName',
]

type Resource = { readonly Type: string; readonly DeletionPolicy?: string; readonly Properties?: Record<string, unknown> }

function resourcesOf(template: Template): Record<string, Resource> {
  return template.toJSON().Resources as Record<string, Resource>
}

function resourcesOfType(template: Template, type: string): Resource[] {
  return Object.values(resourcesOf(template)).filter((resource) => resource.Type === type)
}

describe('separation from the other projects in the account', () => {
  it('names every resource it names with the Hold prefix', () => {
    const names = all.flatMap((template) =>
      Object.values(resourcesOf(template))
        .filter((resource) => !SCOPED_TYPES.has(resource.Type))
        .flatMap((resource) =>
        NAME_PROPERTIES.map((property) => resource.Properties?.[property]).filter((value) => typeof value === 'string'),
      ),
    )

    expect(names.length).toBeGreaterThan(20)
    for (const resourceName of names) expect(resourceName).toMatch(new RegExp(`^${PREFIX}[-/]`))
  })

  it('refers to no resource of Wick or CareCircle', () => {
    for (const template of all) expect(JSON.stringify(template.toJSON())).not.toMatch(/wick|carecircle/i)
  })

  it('tags what it creates with the Hold project', () => {
    data.hasResourceProperties('AWS::S3::Bucket', { Tags: Match.arrayWith([{ Key: 'project', Value: PREFIX }]) })
    work.hasResourceProperties('AWS::SQS::Queue', { Tags: Match.arrayWith([{ Key: 'project', Value: PREFIX }]) })
  })
})

describe('the database', () => {
  it('is Hold own cluster, reached only through the Data API', () => {
    data.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EnableHttpEndpoint: true,
      StorageEncrypted: true,
      DeletionProtection: true,
      DatabaseName: DATABASE_NAME,
    })
    data.hasResourceProperties('AWS::RDS::DBInstance', { PubliclyAccessible: false })
  })

  it('lets nothing connect to it over the network', () => {
    const groups = resourcesOfType(data, 'AWS::EC2::SecurityGroup')
    expect(groups).toHaveLength(1)
    for (const group of groups) {
      expect(group.Properties?.SecurityGroupIngress).toBeUndefined()
    }
    expect(data.findResources('AWS::EC2::SecurityGroupIngress')).toEqual({})
  })

  it('is kept if the stack is deleted', () => {
    data.hasResource('AWS::RDS::DBCluster', { DeletionPolicy: 'Retain' })
  })
})

describe('the evidence bucket', () => {
  it('locks every photograph against change or deletion', () => {
    data.hasResourceProperties('AWS::S3::Bucket', {
      ObjectLockEnabled: true,
      ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: EVIDENCE_RETENTION_DAYS } } },
      VersioningConfiguration: { Status: 'Enabled' },
    })
  })

  it('is private, encrypted and reachable only over TLS, like the display bucket', () => {
    const buckets = resourcesOfType(data, 'AWS::S3::Bucket')
    expect(buckets).toHaveLength(2)
    for (const bucket of buckets) {
      expect(bucket.DeletionPolicy).toBe('Retain')
      expect(bucket.Properties?.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      })
      expect(JSON.stringify(bucket.Properties?.BucketEncryption)).toContain('aws:kms')
    }
    data.resourceCountIs('AWS::S3::BucketPolicy', 2)
    data.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
    })
  })
})

describe('sign-in', () => {
  it('sends codes by email through SES, so no one needs a password', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'hold-staff',
      Policies: { SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(['EMAIL_OTP']) } },
      EmailConfiguration: Match.objectLike({ EmailSendingAccount: 'DEVELOPER' }),
      DeletionProtection: 'ACTIVE',
    })
  })

  it('takes a passkey with user verification as the second factor, and no factor that would end emailed codes', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'OFF',
      Policies: { SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(['EMAIL_OTP', 'WEB_AUTHN']) } },
      WebAuthnRelyingPartyID: 'localhost',
      WebAuthnUserVerification: 'required',
    })
  })

  it('keeps the cookie key in Secrets Manager, under Hold’s name', () => {
    identity.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/cookie-key' })
  })

  it('gives a person ten minutes to type in the code, and hides whether an account exists', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      AuthSessionValidity: 10,
      PreventUserExistenceErrors: 'ENABLED',
    })
  })

  it('has the account types of tech-stack.md section 9.2 as groups', () => {
    for (const groupName of ['owner', 'staff', 'platform_admin']) {
      identity.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: groupName })
    }
  })
})

describe('queues', () => {
  it.each(QUEUES)('$name has a dead-letter queue', (spec) => {
    work.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: `${PREFIX}-${spec.name}${spec.orderedPerRental ? '.fifo' : ''}`,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
      ...(spec.orderedPerRental ? { FifoQueue: true } : {}),
    })
  })

  it('raises an alarm for each dead-letter queue', () => {
    work.resourceCountIs('AWS::CloudWatch::Alarm', QUEUES.length)
  })

  it('lets the scheduler send to Hold queues and do nothing else', () => {
    const policies = resourcesOfType(work, 'AWS::IAM::Policy')
    const statements = policies.flatMap((policy) => (policy.Properties?.PolicyDocument as { Statement: { Action: unknown }[] }).Statement)
    const actions = statements.flatMap((statement) => [statement.Action].flat())

    expect(new Set(actions)).toEqual(new Set(['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl']))
  })
})

describe('the image registry', () => {
  it('keeps each tag pointing at one build', () => {
    registry.hasResourceProperties('AWS::ECR::Repository', { RepositoryName: 'hold-app', ImageTagMutability: 'IMMUTABLE' })
  })
})

describe('the web app', () => {
  type Variable = { Name: string; Value: unknown }
  const service = () => resourcesOfType(web, 'AWS::AppRunner::Service')[0]?.Properties ?? {}
  const variables = () => (service()['SourceConfiguration'] as { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentVariables: Variable[] } } }).ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables
  const instancePolicy = () => JSON.stringify(Object.entries(web.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('InstanceRole')))

  it('runs on App Runner the image CI built from the commit, and changes only when a deploy names a new one', () => {
    web.hasResourceProperties('AWS::AppRunner::Service', {
      ServiceName: 'hold-web',
      SourceConfiguration: {
        AutoDeploymentsEnabled: false,
        ImageRepository: Match.objectLike({ ImageRepositoryType: 'ECR', ImageConfiguration: Match.objectLike({ Port: '3000' }) }),
      },
    })
    const image = JSON.stringify((service()['SourceConfiguration'] as { ImageRepository: { ImageIdentifier: unknown } }).ImageRepository.ImageIdentifier)
    expect(image).toContain('HoldRegistry:ExportsOutputRefRepository')
    expect(image).toContain(`:${IMAGE_TAG}`)
  })

  it('stops at two instances, so a burst of traffic cannot run up the bill through judging', () => {
    web.hasResourceProperties('AWS::AppRunner::AutoScalingConfiguration', { AutoScalingConfigurationName: 'hold-web', MaxSize: 2 })
  })

  it('is told where its services are, and names its secrets without holding them', () => {
    const names = variables().map((variable) => variable.Name)
    for (const setting of ['HOLD_ENVIRONMENT', 'HOLD_AWS_REGION', 'HOLD_COGNITO_USER_POOL_ID', 'HOLD_COGNITO_CLIENT_ID', 'HOLD_DATABASE_CLUSTER_ARN', 'HOLD_DATABASE_SECRET_ARN', 'HOLD_DATABASE_NAME', 'HOLD_COOKIE_KEY_SECRET_ARN', 'HOLD_EMAIL_FROM', 'HOLD_PUBLIC_URL']) {
      expect(names).toContain(setting)
    }
    expect(names).not.toContain('HOLD_COOKIE_KEY')
    expect(variables()).toContainEqual({ Name: 'HOLD_ENVIRONMENT', Value: 'production' })
    expect(variables()).toContainEqual({ Name: 'HOLD_PUBLIC_URL', Value: 'https://abc123.us-east-1.awsapprunner.com' })
  })

  it('logs in to the database as hold_app, never as the owner of the tables', () => {
    const settings = JSON.stringify(variables())
    expect(settings).toContain('AppUserSecret')
    expect(settings).not.toMatch(/DatabaseSecret|database\/admin/)
    expect(instancePolicy()).not.toMatch(/DatabaseSecret|database\/admin/)
  })

  it('may do only what the web app does: query the database, read its secrets, keep PayPal credentials, send email and put a person in a group', () => {
    const statements = Object.entries(web.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('InstanceRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const actions = new Set(statements.flatMap((statement) => [statement.Action].flat()))

    expect(actions).toEqual(
      new Set([
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
        'secretsmanager:GetSecretValue',
        'secretsmanager:CreateSecret',
        'secretsmanager:PutSecretValue',
        'secretsmanager:TagResource',
        'ses:SendEmail',
        'cognito-idp:AdminAddUserToGroup',
      ]),
    )
    expect(instancePolicy()).toContain('secret:hold/paypal/shops/*')
  })
})

describe('delivery', () => {
  it('lets only the main branch of Hold’s repository take the deploy role, through GitHub’s OpenID Connect', () => {
    delivery.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'hold-github-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:rogerjeasy@58919295/hold@1418569084:ref:refs/heads/main',
              },
            },
          }),
        ],
      }),
    })
  })

  it('refers to the account’s GitHub identity provider instead of making a second', () => {
    delivery.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0)
    delivery.resourceCountIs('AWS::IAM::OIDCProvider', 0)
  })

  it('never takes the account’s CDK bootstrap roles, which could deploy any stack', () => {
    const policies = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(policies).not.toContain('cdk-hnb659fds-deploy-role')
    expect(policies).not.toContain('cdk-hnb659fds-cfn-exec-role')
  })

  it('lets the pipeline change only Hold’s resource stacks, and not the one holding its own roles', () => {
    const policies = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    for (const name of ['HoldData', 'HoldIdentity', 'HoldWork', 'HoldRegistry', 'HoldWeb']) expect(policies).toContain(`stack/${name}/*`)
    expect(policies).not.toContain('stack/HoldDelivery')
    expect(policies).not.toContain('stack/*')
  })

  it('reaches only Hold’s image repository, database and database secrets', () => {
    const policy = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(policy).toContain('repository/hold-app')
    expect(policy).toContain('cluster:hold-database')
    expect(policy).toContain('secret:hold/database/admin-*')
  })

  it('gives CloudFormation a role that cannot change the pipeline’s own roles', () => {
    const policies = delivery.findResources('AWS::IAM::Policy')
    const statements = Object.values(policies).flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: { Effect: string; Resource: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const denied = statements.filter((statement) => statement.Effect === 'Deny').flatMap((statement) => JSON.stringify(statement.Resource))
    expect(denied.join()).toContain('role/hold-github-deploy')
    expect(denied.join()).toContain('role/hold-cloudformation-exec')
  })

  it('caps every role the resource stacks make with Hold’s permissions boundary', () => {
    for (const template of [data, identity, work, registry, web]) {
      for (const role of Object.values(template.findResources('AWS::IAM::Role'))) {
        expect(JSON.stringify(role)).toContain('policy/hold-permissions-boundary')
      }
    }
  })

  it('lets CloudFormation make roles only with the boundary, and never take it off', () => {
    const statements = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(statements).toContain('iam:PermissionsBoundary')
    expect(statements).toMatch(/"Effect":"Deny"[^}]*iam:DeleteRolePermissionsBoundary|iam:DeleteRolePermissionsBoundary[^}]*"Effect":"Deny"/)
  })

  it('keeps the boundary to what the app needs, and lets it hand on only the scheduler’s role', () => {
    const boundary = JSON.stringify(Object.values(delivery.findResources('AWS::IAM::ManagedPolicy'))[0])
    for (const broad of ['"sqs:*"', '"s3:*"', '"cognito-idp:*"', '"secretsmanager:*"', '"rds-data:*"', '"scheduler:*"', 'cloudformation:', 'iam:CreateRole', 'cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword']) {
      expect(boundary).not.toContain(broad)
    }
    expect(boundary).toContain('role/hold-scheduler')
    expect(boundary).toContain('"iam:PassedToService":"scheduler.amazonaws.com"')
    expect(boundary).not.toContain('role/hold-*')
  })

  it('lets CloudFormation change only roles that carry Hold’s tag, and hand on only the web app’s two roles, to App Runner', () => {
    const statements = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(statements).toMatch(/iam:UpdateAssumeRolePolicy[^}]*aws:ResourceTag\/project/)

    const passing = Object.values(delivery.findResources('AWS::IAM::Policy'))
      .flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement)
      .filter((statement) => [statement['Action']].flat().includes('iam:PassRole'))
    const allowed = passing.filter((statement) => statement['Effect'] === 'Allow' && JSON.stringify(statement).includes('role/hold-web'))
    expect(allowed).toHaveLength(1)
    expect(JSON.stringify(allowed[0]?.['Resource'])).toMatch(/role\/hold-web".*role\/hold-web-access"|role\/hold-web-access".*role\/hold-web"/)
    // App Runner checks the pass with a service name of its own choosing, so none is named here. Both roles trust App
    // Runner alone, so no other service could use them.
    expect(allowed[0]?.['Condition']).toBeUndefined()
    for (const role of resourcesOfType(web, 'AWS::IAM::Role')) {
      const principals = (role.Properties?.['AssumeRolePolicyDocument'] as { Statement: { Principal: { Service: string } }[] }).Statement.map((statement) => statement.Principal.Service)
      for (const principal of principals) expect(principal).toMatch(/^(build|tasks)\.apprunner\.amazonaws\.com$/)
    }
    const denied = passing.find((statement) => statement['Effect'] === 'Deny')
    expect(JSON.stringify(denied?.['NotResource'])).toContain('role/hold-web-access')
  })

  it('lets CloudFormation make only App Runner services that carry Hold’s tag, and change only Hold’s', () => {
    const statements = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(statements).toMatch(/apprunner:CreateService[^}]*aws:RequestTag\/project/)
    expect(statements).toContain('service/hold-*')
    expect(statements).not.toContain('"apprunner:*"')
  })

  it('never lets CloudFormation describe another project’s App Runner service, whose settings it would read', () => {
    const statements = Object.values(delivery.findResources('AWS::IAM::Policy'))
      .flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement)
      .filter((statement) => statement['Effect'] === 'Allow')
    const describing = statements.filter((statement) => [statement['Action']].flat().some((action) => /^apprunner:(Describe|List|Get)/.test(String(action)) && !/^apprunner:List(Services|AutoScalingConfigurations)$/.test(String(action))))

    expect(describing.length).toBeGreaterThan(0)
    for (const statement of describing) {
      for (const resource of [statement['Resource']].flat()) expect(String(resource)).toMatch(/:(service|autoscalingconfiguration)\/hold-\*\/\*$/)
    }
  })

  it('never lets the project tag be set on something that already exists', () => {
    const statements = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(statements).toContain('"ec2:CreateAction":"CreateSecurityGroup"')
    expect(statements).toContain('"aws:TagKeys":["project"]')
  })

  it('gives CloudFormation no way to read what Hold’s resources hold', () => {
    const exec = Object.entries(delivery.findResources('AWS::IAM::Policy')).find(([key]) => key.startsWith('CloudFormationRole'))?.[1]
    const allowed = JSON.stringify((exec as { Properties: { PolicyDocument: { Statement: { Effect: string }[] } } }).Properties.PolicyDocument.Statement.filter((entry) => entry.Effect === 'Allow'))
    for (const action of ['s3:GetObject', 's3:*', 'sqs:ReceiveMessage', 'sqs:*', 'secretsmanager:*', 'cognito-idp:*', 'cognito-idp:AdminInitiateAuth', 'rds:*', 'ecr:*']) {
      expect(allowed).not.toContain(`"${action}"`)
    }
    expect(allowed).not.toContain('secret:hold/paypal')
  })

  it('deploys every stack with the caller’s credentials, under Hold’s prefix in the bootstrap bucket', () => {
    for (const template of all) expect(JSON.stringify(template.toJSON())).not.toContain('cdk-hnb659fds-deploy-role')
  })
})
