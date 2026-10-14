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

const stacks = createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', passkeyRelyingPartyId: 'localhost' })
const data = Template.fromStack(stacks.data.stack)
const identity = Template.fromStack(stacks.identity.stack)
const work = Template.fromStack(stacks.work.stack)
const registry = Template.fromStack(stacks.registry.stack)
const all = [data, identity, work, registry]

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
