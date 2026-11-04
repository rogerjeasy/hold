import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'
import { CODE_KEY_ARN, CREDENTIAL_KEY_ALIAS, DATABASE_NAME, EVIDENCE_KEPT_DAYS, EVIDENCE_LOCK_DAYS, PREFIX } from './settings.ts'
import { QUEUES } from './work-stack.ts'

// The default VPC lookup recorded by the first synth, so the tests build the same app with no AWS access.
// Assets are not bundled: these tests read the templates, and bundling the worker installs sharp for the machine.
const context = { ...(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>), 'aws:cdk:bundling-stacks': [] }

const IMAGE_TAG = '0123456789abcdef0123456789abcdef01234567'
const stacks = createHoldApp(new App({ context }), {
  senderEmail: 'codes@example.com',
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
  'TopicName',
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

  // Least privilege: Hold calls Claude through bedrock-runtime on two inference profiles (settings.ts), so no role or
  // boundary keeps a grant for the Mantle endpoint or for the Opus 5.5 and 4.8 models the design first named.
  it('grants no model Hold does not call', () => {
    for (const template of all) expect(JSON.stringify(template.toJSON())).not.toMatch(/bedrock-mantle|claude-opus-5-5|claude-opus-4-8/)
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

  it('keeps automated backups for 35 days, the most AWS allows', () => {
    data.hasResourceProperties('AWS::RDS::DBCluster', { BackupRetentionPeriod: 35 })
  })
})

describe('the evidence bucket', () => {
  it('locks every photograph against change or deletion', () => {
    data.hasResourceProperties('AWS::S3::Bucket', {
      ObjectLockEnabled: true,
      ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: EVIDENCE_LOCK_DAYS } } },
      VersioningConfiguration: { Status: 'Enabled' },
    })
  })

  // The period the privacy notice states. On a versioned bucket the day's rule hides the photograph behind a delete
  // marker and the next removes the version itself; S3 removes no version while its Object Lock retention runs.
  it('deletes each photograph, manifest and pack a year after it was written, never before its lock ends', () => {
    expect(EVIDENCE_KEPT_DAYS).toBeGreaterThanOrEqual(EVIDENCE_LOCK_DAYS)
    data.hasResourceProperties('AWS::S3::Bucket', {
      ObjectLockEnabled: true,
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ Status: 'Enabled', ExpirationInDays: EVIDENCE_KEPT_DAYS, NoncurrentVersionExpiration: { NoncurrentDays: 1 } }),
          Match.objectLike({ Status: 'Enabled', ExpiredObjectDeleteMarker: true }),
        ]),
      },
    })
  })

  it('deletes the face-blurred copies when it deletes the photographs they were made from', () => {
    const display = resourcesOfType(data, 'AWS::S3::Bucket').find((bucket) => bucket.Properties?.['ObjectLockEnabled'] === undefined)
    expect(JSON.stringify(display?.Properties?.['LifecycleConfiguration'])).toContain(`"ExpirationInDays":${String(EVIDENCE_KEPT_DAYS)}`)
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
      WebAuthnUserVerification: 'required',
    })
  })

  it('makes passkeys for the address the web app is served from, so a browser offers them there', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPool', { WebAuthnRelyingPartyID: 'abc123.us-east-1.awsapprunner.com' })
  })

  it('makes passkeys for localhost until App Runner has given the web app an address', () => {
    const first = createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: IMAGE_TAG, webPublicUrl: undefined })
    Template.fromStack(first.identity.stack).hasResourceProperties('AWS::Cognito::UserPool', { WebAuthnRelyingPartyID: 'localhost' })
  })

  it('lets a phone put photographs into the evidence bucket only from the web app’s own address', () => {
    data.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'hold-evidence-707938860881',
      CorsConfiguration: { CorsRules: [{ AllowedMethods: ['PUT'], AllowedOrigins: ['https://abc123.us-east-1.awsapprunner.com'], AllowedHeaders: ['content-type', 'x-amz-checksum-sha256'], MaxAge: 300 }] },
    })
  })

  it('keeps the cookie key in Secrets Manager, under Hold’s name', () => {
    identity.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/cookie-key' })
  })

  it('keeps the key renter links are signed with apart from the cookie key, so the worker can sign links without it', () => {
    identity.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/renter-link-key' })
  })

  it('keeps the secret renter keys are made with apart from every other key (extensions.md section 7.4)', () => {
    identity.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/trust-key' })
  })

  it('gives a person ten minutes to type in the code, and hides whether an account exists', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      AuthSessionValidity: 10,
      PreventUserExistenceErrors: 'ENABLED',
    })
  })

  it('hands every code to Hold’s own sender, encrypted with Hold’s own key, instead of sending it through SES', () => {
    identity.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: {
        CustomEmailSender: { LambdaVersion: 'V1_0', LambdaArn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^CodeSender'), 'Arn'] } },
        KMSKeyID: CODE_KEY_ARN,
      },
    })
    // The key is an administrator's (settings.ts), so the pipeline never has to make or tag one.
    identity.resourceCountIs('AWS::KMS::Key', 0)
  })

  it('lets only Hold’s user pool call the code sender', () => {
    identity.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'cognito-idp.amazonaws.com',
      SourceArn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^UserPool'), 'Arn'] },
    })
    identity.resourceCountIs('AWS::Lambda::Permission', 1)
  })

  it('names the SMTP login’s secret to the code sender, never the login itself', () => {
    identity.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'hold-code-sender',
      Environment: { Variables: { HOLD_SMTP_SECRET: 'hold/email/smtp', HOLD_CODE_KEY_ARN: Match.anyValue() } },
    })
  })

  it('lets the code sender decrypt codes, read the SMTP login and write its logs, and nothing else', () => {
    const statements = Object.entries(identity.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('CodeSenderRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const actions = new Set(statements.flatMap((statement) => [statement.Action].flat()))

    expect(actions).toEqual(new Set(['kms:Decrypt', 'secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents']))
    expect(JSON.stringify(statements)).toContain('secret:hold/email/smtp-??????')
    identity.resourceCountIs('AWS::IAM::ManagedPolicy', 0)
    for (const role of Object.values(identity.findResources('AWS::IAM::Role'))) expect(JSON.stringify(role)).not.toContain('ManagedPolicyArns')
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

  it('deduplicates the upkeep queue by content, since EventBridge Scheduler cannot name a deduplication id', () => {
    work.hasResourceProperties('AWS::SQS::Queue', { QueueName: `${PREFIX}-upkeep.fifo`, FifoQueue: true, ContentBasedDeduplication: true })
  })

  it('raises an alarm for each dead-letter queue', () => {
    const deadLetterAlarms = Object.values(work.findResources('AWS::CloudWatch::Alarm')).filter((alarm) => String((alarm as { Properties: { AlarmName: unknown } }).Properties.AlarmName).endsWith('-dead-letter'))
    expect(deadLetterAlarms).toHaveLength(QUEUES.length)
  })

  it('keeps the scheduler role’s description as deployed, since the pipeline may not change a role’s description', () => {
    work.hasResourceProperties('AWS::IAM::Role', { RoleName: 'hold-scheduler', Description: 'Assumed by EventBridge Scheduler to deliver Hold schedules to Hold queues, and nothing else.' })
  })

  it('lets the scheduler send to Hold queues and start the outbox relay, and do nothing else', () => {
    const statements = Object.entries(work.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('SchedulerRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const actions = statements.flatMap((statement) => [statement.Action].flat())

    expect(new Set(actions)).toEqual(new Set(['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'lambda:InvokeFunction']))
  })

  it('keeps a message hidden for longer than its worker may run, so two never handle it at once', () => {
    for (const [queue, worker] of [
      ['hold-paypal-events.fifo', 'hold-worker-paypal-events'],
      ['hold-executions.fifo', 'hold-worker-executions'],
      ['hold-upkeep.fifo', 'hold-worker-upkeep'],
    ]) {
      const visibility = resourcesOfType(work, 'AWS::SQS::Queue').find((each) => each.Properties?.['QueueName'] === queue)?.Properties?.['VisibilityTimeout'] as number
      const timeout = resourcesOfType(work, 'AWS::Lambda::Function').find((each) => each.Properties?.['FunctionName'] === worker)?.Properties?.['Timeout'] as number
      expect(visibility).toBeGreaterThanOrEqual(timeout)
    }
  })
})

describe('the worker', () => {
  const functionNamed = (functionName: string) => resourcesOfType(work, 'AWS::Lambda::Function').find((each) => each.Properties?.['FunctionName'] === functionName)
  const workerPolicy = () =>
    Object.entries(work.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('WorkerRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown }[] } } }).Properties.PolicyDocument.Statement)

  it('runs negotiations from their own queue, in order per rental, with a role that may ask Claude, use the database and read display copies, and nothing else', () => {
    expect(functionNamed('hold-worker-negotiations')?.Properties).toMatchObject({ Runtime: 'nodejs24.x', Timeout: 600, Environment: { Variables: expect.objectContaining({ HOLD_DISPLAY_BUCKET: expect.anything() as unknown }) as unknown } })
    work.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'hold-negotiations.fifo', VisibilityTimeout: 720, FifoQueue: true })
    work.hasResourceProperties('AWS::Lambda::EventSourceMapping', { FunctionName: { Ref: Match.stringLikeRegexp('^NegotiationWorker') }, BatchSize: 1, FunctionResponseTypes: ['ReportBatchItemFailures'] })
    const statements = Object.entries(work.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('NegotiationRole')).flatMap(([, value]) => (value as { Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const policy = JSON.stringify(statements)
    expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-5-20251101-v1:0')
    // The advocates look at the display copies of a claim's photographs, and at nothing else in storage.
    const storage = statements.filter((statement) => JSON.stringify(statement.Action).includes('s3:'))
    expect(storage.map((statement) => [statement.Action].flat())).toEqual([['s3:GetObject']])
    expect(JSON.stringify(storage[0]?.Resource)).toContain('DisplayBucket')
    expect(policy).not.toMatch(/sqs:SendMessage|paypal\/shops|s3:PutObject|s3:GetObjectVersion|EvidenceBucket|smtp|scheduler:/)
    web.hasResourceProperties('AWS::AppRunner::Service', { SourceConfiguration: { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentVariables: Match.arrayWith([{ Name: 'HOLD_NEGOTIATIONS_QUEUE_URL', Value: Match.anyValue() }]) } } } })
    work.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'hold-worker-outbox-relay', Environment: { Variables: Match.objectLike({ HOLD_NEGOTIATIONS_QUEUE_URL: Match.anyValue() }) } })
  })

  it('sends to the owner, every five minutes, a negotiation nobody moved in time, with the negotiation role', () => {
    expect(functionNamed('hold-worker-negotiation-sweep')?.Properties).toMatchObject({ Runtime: 'nodejs24.x', Role: { 'Fn::GetAtt': [expect.stringMatching(/^NegotiationRole/) as unknown, 'Arn'] } })
    work.hasResourceProperties('AWS::Scheduler::Schedule', { Name: 'hold-negotiation-sweep', ScheduleExpression: 'rate(5 minutes)', Target: Match.objectLike({ Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^NegotiationSweep'), 'Arn'] } }) })
  })

  // A judge's demo is retired a week after it opened (architecture.md section 20.3). Only this function may delete a
  // user, and only in Hold's pool; it reads no PayPal credential, sends to no queue and calls no model.
  it('retires old demos once a day with a role of its own, which alone may delete a user, in Hold’s pool only', () => {
    expect(functionNamed('hold-worker-demo-cleanup')?.Properties).toMatchObject({
      Runtime: 'nodejs24.x',
      Role: { 'Fn::GetAtt': [expect.stringMatching(/^DemoCleanupRole/) as unknown, 'Arn'] },
      Environment: { Variables: expect.objectContaining({ HOLD_USER_POOL_ID: expect.anything() as unknown }) as unknown },
    })
    work.hasResourceProperties('AWS::Scheduler::Schedule', { Name: 'hold-demo-cleanup', ScheduleExpression: 'cron(30 3 * * ? *)', FlexibleTimeWindow: { Mode: 'OFF' }, Target: Match.objectLike({ Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^DemoCleanup'), 'Arn'] } }) })
    work.hasResourceProperties('AWS::IAM::Role', { RoleName: 'hold-demo-cleanup' })

    const statements = Object.entries(work.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('DemoCleanupRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const deleting = statements.filter((statement) => [statement.Action].flat().includes('cognito-idp:AdminDeleteUser'))
    expect(deleting).toHaveLength(1)
    expect([deleting[0]?.Action].flat()).toEqual(['cognito-idp:AdminDeleteUser'])
    expect(JSON.stringify(deleting[0]?.Resource)).toMatch(/UserPool/)
    expect(JSON.stringify(deleting[0]?.Resource)).not.toContain('*')
    const actions = new Set(statements.flatMap((statement) => [statement.Action].flat()))
    expect(actions).toEqual(
      new Set([
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
        'cognito-idp:AdminDeleteUser',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ]),
    )
    // No other role of Hold's may delete a user.
    for (const template of all) {
      for (const [key, policy] of Object.entries(template.findResources('AWS::IAM::Policy'))) {
        if (!key.startsWith('DemoCleanupRole')) expect(JSON.stringify(policy)).not.toContain('AdminDeleteUser')
      }
    }
  })

  it('runs comparisons from their queue with a separate role that cannot send money work or read PayPal credentials', () => {
    expect(functionNamed('hold-worker-comparisons')?.Properties).toMatchObject({ Runtime: 'nodejs24.x', MemorySize: 1536 })
    work.resourceCountIs('AWS::Lambda::EventSourceMapping', 10)
    const policies = Object.entries(work.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('ComparisonRole')).map(([, value]) => value)
    expect(policies.length).toBeGreaterThan(0)
    const policy = JSON.stringify(policies)
    expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-6-v1')
    expect(policy).not.toContain('sqs:SendMessage')
    expect(policy).not.toContain('paypal/shops')
    expect(policy).not.toContain('s3:PutObject')
  })

  it('runs five functions on Node 24: PayPal events, executions, hold upkeep, display copies and the outbox relay', () => {
    for (const functionName of ['hold-worker-paypal-events', 'hold-worker-executions', 'hold-worker-upkeep', 'hold-worker-media', 'hold-worker-outbox-relay']) {
      expect(functionNamed(functionName)?.Properties).toMatchObject({ Runtime: 'nodejs24.x' })
    }
  })

  it('takes PayPal events, executions and upkeep from their queues, and tries again only the messages that failed', () => {
    work.resourceCountIs('AWS::Lambda::EventSourceMapping', 10)
    work.hasResourceProperties('AWS::Lambda::EventSourceMapping', { FunctionResponseTypes: ['ReportBatchItemFailures'] })
  })

  it('relays the outbox every minute, through the scheduler, in Hold’s schedule group', () => {
    work.hasResourceProperties('AWS::Scheduler::Schedule', { Name: 'hold-outbox-relay', ScheduleExpression: 'rate(1 minute)', GroupName: Match.anyValue(), FlexibleTimeWindow: { Mode: 'OFF' } })
  })

  it('logs in to the database as hold_worker, never as the app or the owner of the tables', () => {
    const settings = JSON.stringify(functionNamed('hold-worker-executions')?.Properties?.['Environment'])
    expect(settings).toContain('WorkerUserSecret')
    expect(settings).not.toMatch(/AppUserSecret|DatabaseSecret|database\/admin/)
    data.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/database/worker' })
    expect(JSON.stringify(data.findResources('AWS::SecretsManager::Secret'))).toContain('\\"username\\":\\"hold_worker\\"')
  })

  it('may only query the database, read its login and the shops’ PayPal credentials, use its queues, text a renter and write its logs', () => {
    const actions = new Set(workerPolicy().flatMap((statement) => [statement.Action].flat()))
    expect(actions).toEqual(
      new Set([
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
        'secretsmanager:GetSecretValue',
        'sqs:ReceiveMessage',
        'sqs:ChangeMessageVisibility',
        'sqs:GetQueueUrl',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
        'sqs:SendMessage',
        'scheduler:CreateSchedule',
        'scheduler:UpdateSchedule',
        'scheduler:DeleteSchedule',
        'iam:PassRole',
        's3:GetObject',
        's3:PutObject',
        'rekognition:DetectFaces',
        'sms-voice:SendTextMessage',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ]),
    )
    expect(JSON.stringify(workerPolicy())).toContain('secret:hold/paypal/shops/*')
    expect(JSON.stringify(workerPolicy())).not.toContain('secretsmanager:PutSecretValue')
  })

  it('makes a hold’s schedules only in Hold’s group, and hands them only the scheduler’s role', () => {
    const scheduling = workerPolicy().find((statement) => [statement.Action].flat().includes('scheduler:CreateSchedule'))
    expect(JSON.stringify(scheduling)).toContain(':schedule/hold-schedules/*')
    const passing = workerPolicy().find((statement) => [statement.Action].flat().includes('iam:PassRole')) as { Condition?: unknown } | undefined
    expect(JSON.stringify(passing)).toContain('SchedulerRole')
    expect(passing?.Condition).toEqual({ StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } })
  })

  it('emails through Hold’s SMTP login, read by name, with links to the web app’s own address', () => {
    const settings = JSON.stringify(functionNamed('hold-worker-upkeep')?.Properties?.['Environment'])
    expect(settings).toContain('"HOLD_SMTP_SECRET":"hold/email/smtp"')
    expect(settings).toContain('"HOLD_PUBLIC_URL":"https://abc123.us-east-1.awsapprunner.com"')
    expect(JSON.stringify(workerPolicy())).toContain('secret:hold/email/smtp')
  })

  it('reads the locked originals and writes display copies, with room for the images, and deletes nothing', () => {
    expect(functionNamed('hold-worker-media')?.Properties).toMatchObject({ MemorySize: 1536 })
    const onEvidence = workerPolicy().find((statement) => JSON.stringify(statement).includes('EvidenceBucket'))
    const onDisplay = workerPolicy().find((statement) => JSON.stringify(statement).includes('DisplayBucket'))
    expect([onEvidence?.Action].flat()).toEqual(['s3:GetObject'])
    expect([onDisplay?.Action].flat()).toEqual(['s3:PutObject'])
    expect(JSON.stringify(workerPolicy())).not.toMatch(/s3:Delete/)
    const settings = JSON.stringify(functionNamed('hold-worker-media')?.Properties?.['Environment'])
    for (const setting of ['HOLD_EVIDENCE_BUCKET', 'HOLD_DISPLAY_BUCKET']) expect(settings).toContain(setting)
  })

  it('signs renter links with their own key, and can never read the web app’s cookie key', () => {
    const settings = JSON.stringify(functionNamed('hold-worker-upkeep')?.Properties?.['Environment'])
    expect(settings).toContain('HOLD_RENTER_LINK_KEY_SECRET_ARN')
    expect(JSON.stringify(workerPolicy())).toContain('RenterLinkKey')
    expect(JSON.stringify(workerPolicy())).not.toContain('CookieKey')
  })

  it('tells the worker where to schedule a hold’s upkeep and where it is sent', () => {
    const settings = JSON.stringify(functionNamed('hold-worker-executions')?.Properties?.['Environment'])
    for (const variable of ['HOLD_UPKEEP_QUEUE_URL', 'HOLD_UPKEEP_QUEUE_ARN', 'HOLD_SCHEDULE_GROUP', 'HOLD_SCHEDULER_ROLE_ARN']) expect(settings).toContain(variable)
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

  it('cannot be deleted by accident, since a new service would get a new address', () => {
    expect(stacks.web.stack.terminationProtection).toBe(true)
  })

  it('is checked over HTTP on a path that answers without the database, which may be paused', () => {
    web.hasResourceProperties('AWS::AppRunner::Service', { HealthCheckConfiguration: { Protocol: 'HTTP', Path: '/api/health', Interval: 10, Timeout: 5, HealthyThreshold: 1, UnhealthyThreshold: 5 } })
    expect(existsSync(join(import.meta.dirname, '..', '..', 'apps', 'web', 'src', 'app', 'api', 'health', 'route.ts'))).toBe(true)
  })

  it('stops at two instances, so a burst of traffic cannot run up the bill through judging', () => {
    web.hasResourceProperties('AWS::AppRunner::AutoScalingConfiguration', { AutoScalingConfigurationName: 'hold-web', MaxSize: 2 })
  })

  it('is told where its services are, and names its secrets without holding them', () => {
    const names = variables().map((variable) => variable.Name)
    for (const setting of ['HOLD_ENVIRONMENT', 'HOLD_AWS_REGION', 'HOLD_COGNITO_USER_POOL_ID', 'HOLD_COGNITO_CLIENT_ID', 'HOLD_DATABASE_CLUSTER_ARN', 'HOLD_DATABASE_SECRET_ARN', 'HOLD_DATABASE_NAME', 'HOLD_COOKIE_KEY_SECRET_ARN', 'HOLD_RENTER_LINK_KEY_SECRET_ARN', 'HOLD_TRUST_KEY_SECRET_ARN', 'HOLD_CREDENTIAL_KEY_ID', 'HOLD_SMTP_SECRET', 'HOLD_PUBLIC_URL', 'HOLD_EXECUTIONS_QUEUE_URL', 'HOLD_PAYPAL_EVENTS_QUEUE_URL']) {
      expect(names).toContain(setting)
    }
    expect(names).not.toContain('HOLD_COOKIE_KEY')
    expect(names).not.toContain('HOLD_RENTER_LINK_KEY')
    expect(names).not.toContain('HOLD_TRUST_KEY')
    expect(variables()).toContainEqual({ Name: 'HOLD_CREDENTIAL_KEY_ID', Value: CREDENTIAL_KEY_ALIAS })
    expect(variables()).toContainEqual({ Name: 'HOLD_ENVIRONMENT', Value: 'production' })
    expect(variables()).toContainEqual({ Name: 'HOLD_SMTP_SECRET', Value: 'hold/email/smtp' })
    expect(variables()).toContainEqual({ Name: 'HOLD_PUBLIC_URL', Value: 'https://abc123.us-east-1.awsapprunner.com' })
  })

  it('takes the AG Grid licence key from Secrets Manager when it starts, never as a plain setting', () => {
    const secrets = (service()['SourceConfiguration'] as { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentSecrets: Variable[] } } }).ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets
    web.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/ag-grid-licence' })
    expect(JSON.stringify(secrets.find((secret) => secret.Name === 'HOLD_AG_GRID_LICENCE_KEY')?.Value)).toContain('GridLicence')
    expect(variables().map((variable) => variable.Name)).not.toContain('HOLD_AG_GRID_LICENCE_KEY')
    expect(instancePolicy()).toContain('GridLicence')
  })

  it('takes the AG Studio licence key from a secret of its own when it starts, never as a plain setting', () => {
    const secrets = (service()['SourceConfiguration'] as { ImageRepository: { ImageConfiguration: { RuntimeEnvironmentSecrets: Variable[] } } }).ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets
    web.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/web/ag-studio-licence' })
    expect(JSON.stringify(secrets.find((secret) => secret.Name === 'HOLD_AG_STUDIO_LICENCE_KEY')?.Value)).toContain('StudioLicence')
    expect(variables().map((variable) => variable.Name)).not.toContain('HOLD_AG_STUDIO_LICENCE_KEY')
    expect(instancePolicy()).toContain('StudioLicence')
  })

  // Each judge's demo gets accounts of its own (architecture.md section 20.3). The app may create a user, never set a
  // password with administrator rights, so it cannot change an existing person's.
  it('turns demo sessions on, lets the app create a demo’s users in Hold’s pool, and never set a password', () => {
    expect(variables()).toContainEqual({ Name: 'HOLD_DEMO_SESSIONS', Value: 'on' })
    const policy = instancePolicy()
    expect(policy).toContain('cognito-idp:AdminCreateUser')
    expect(policy).not.toMatch(/AdminSetUserPassword|AdminDeleteUser|AdminUpdateUserAttributes|demo-accounts/)
    const boundary = Object.values(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-permissions-boundary' } }))[0]
    expect(JSON.stringify(boundary)).toContain('cognito-idp:AdminCreateUser')
  })

  // The demo cleanup removes a retired demo's accounts. HoldDelivery, deployed by an administrator, must allow it first.
  it('lets Hold’s roles delete a user only in a user pool that carries Hold’s tag', () => {
    const boundary = Object.values(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-permissions-boundary' } }))[0]
    const statement = (boundary as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement.find((each) => [each['Action']].flat().includes('cognito-idp:AdminDeleteUser'))
    expect(statement).toMatchObject({ Effect: 'Allow', Resource: 'arn:aws:cognito-idp:us-east-1:707938860881:userpool/*', Condition: { StringEquals: { 'aws:ResourceTag/project': 'hold' } } })
  })

  it('logs in to the database as hold_app, never as the owner of the tables', () => {
    const settings = JSON.stringify(variables())
    expect(settings).toContain('AppUserSecret')
    expect(settings).not.toMatch(/DatabaseSecret|database\/admin/)
    expect(instancePolicy()).not.toMatch(/DatabaseSecret|database\/admin/)
  })

  it('may ask Claude on Bedrock to sort an incident report, with the models named and nothing else of Bedrock', () => {
    const policy = instancePolicy()
    expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-6-v1')
    expect(policy).not.toContain('foundation-model/*')
  })

  // The comparison runs on Opus 4.6 and every agent on Opus 4.5, each through its US inference profile, which may send
  // a call to any of three regions: each role may invoke the two profiles and those two models there, nothing wider.
  it('lets every role that asks Claude invoke Opus 4.6 and Opus 4.5 through their US profiles, on those models in the profiles\' regions only', () => {
    const rolePolicy = (stack: Template, prefix: string) => JSON.stringify(Object.entries(stack.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith(prefix)).map(([, value]) => value))
    const boundary = JSON.stringify(delivery.findResources('AWS::IAM::ManagedPolicy'))
    for (const policy of [rolePolicy(work, 'ComparisonRole'), rolePolicy(work, 'NegotiationRole'), rolePolicy(work, 'OperationsRole'), instancePolicy(), rolePolicy(delivery, 'EvalRole'), boundary]) {
      expect(policy).toContain('bedrock:InvokeModel')
      expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-6-v1')
      for (const region of ['us-east-1', 'us-east-2', 'us-west-2']) expect(policy).toContain(`arn:aws:bedrock:${region}::foundation-model/anthropic.claude-opus-4-6-v1`)
      expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-5-20251101-v1:0')
      for (const region of ['us-east-1', 'us-east-2', 'us-west-2']) expect(policy).toContain(`arn:aws:bedrock:${region}::foundation-model/anthropic.claude-opus-4-5-20251101-v1:0`)
    }
  })

  it('may do only what the web app does: query the database, read its secrets, keep PayPal credentials, hand work to the worker, sort an incident, put a person in a group, create a demo’s users and text a renter', () => {
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
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminCreateUser',
        'sms-voice:SendTextMessage',
        'sqs:SendMessage',
        'sqs:GetQueueAttributes',
        'sqs:GetQueueUrl',
        's3:GetObject',
        's3:GetObjectVersion',
        's3:PutObject',
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'kms:Sign',
        'kms:GetPublicKey',
      ]),
    )
    expect(instancePolicy()).toContain('secret:hold/paypal/shops/*')
    expect(instancePolicy()).toContain('secret:hold/email/smtp-??????')
  })

  it('signs Clean Record credentials with the credential key only, by ES256, reads its public key, and reads the renter key secret', () => {
    const statements = Object.entries(web.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('InstanceRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement)
    const onKeys = statements.filter((statement) => [statement['Action']].flat().some((action) => String(action).startsWith('kms:')))
    expect(onKeys).toEqual([
      {
        Action: 'kms:Sign',
        Effect: 'Allow',
        Resource: 'arn:aws:kms:us-east-1:707938860881:key/*',
        Condition: { 'StringEquals': { 'aws:ResourceTag/project': 'hold', 'kms:SigningAlgorithm': 'ECDSA_SHA_256' }, 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': CREDENTIAL_KEY_ALIAS } },
      },
      {
        Action: 'kms:GetPublicKey',
        Effect: 'Allow',
        Resource: 'arn:aws:kms:us-east-1:707938860881:key/*',
        Condition: { 'StringEquals': { 'aws:ResourceTag/project': 'hold' }, 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': CREDENTIAL_KEY_ALIAS } },
      },
    ])
    expect(instancePolicy()).toContain('TrustKey')
  })

  it('signs uploads into the evidence bucket and reads back what arrived, reads display copies, and deletes nothing', () => {
    const statements = Object.entries(web.findResources('AWS::IAM::Policy'))
      .filter(([key]) => key.startsWith('InstanceRole'))
      .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: { Action: unknown; Resource: unknown }[] } } }).Properties.PolicyDocument.Statement)
    const onEvidence = statements.find((statement) => JSON.stringify(statement.Resource).includes('EvidenceBucket'))
    const onDisplay = statements.find((statement) => JSON.stringify(statement.Resource).includes('DisplayBucket'))
    expect(new Set([onEvidence?.Action].flat())).toEqual(new Set(['s3:GetObject', 's3:PutObject']))
    expect([onDisplay?.Action].flat()).toEqual(['s3:GetObject'])
    expect(JSON.stringify(statements)).not.toMatch(/s3:Delete|s3:\*/)
    const names = variables().map((variable) => variable.Name)
    for (const setting of ['HOLD_EVIDENCE_BUCKET', 'HOLD_DISPLAY_BUCKET', 'HOLD_MEDIA_QUEUE_URL']) expect(names).toContain(setting)
  })
})

describe('the comparison gate', () => {
  const evalPolicy = () => JSON.stringify(Object.entries(delivery.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('EvalRole')).map(([, policy]) => policy))

  it('lets only the main branch of Hold’s repository take the evaluation role, never a pull request’s own code', () => {
    delivery.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'hold-github-eval',
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

  it('may call the comparison model, query the database and read the evaluation login, and nothing else', () => {
    const policy = evalPolicy()
    expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-6-v1')
    expect(policy).toContain('cluster:hold-database')
    expect(policy).toContain('secret:hold/database/eval-*')
    expect(policy).not.toContain('foundation-model/*')
    for (const forbidden of ['database/admin', 'database/app', 'database/worker', 'cloudformation', 'ecr:', 's3:', 'iam:', 'sqs:']) expect(policy).not.toContain(forbidden)
  })

  it('keeps the evaluation login in its own secret, which the deploy gives its password', () => {
    data.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hold/database/eval' })
    expect(JSON.stringify(delivery.findResources('AWS::IAM::Policy'))).toContain('secret:hold/database/eval-*')
  })
})

describe('delivery', () => {
  // CloudFormation's role: its own policy and the policy for running Hold's code, which is apart only for size.
  const cloudFormationPolicies = () => JSON.stringify({ ...delivery.findResources('AWS::IAM::Policy'), ...delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-cloudformation-compute' } }) })
  type Statement = Record<string, unknown> & { Effect: string }
  const cloudFormationStatements = (): Statement[] =>
    [
      Object.entries(delivery.findResources('AWS::IAM::Policy')).find(([key]) => key.startsWith('CloudFormationRole'))?.[1],
      ...Object.values(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-cloudformation-compute' } })),
    ].flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement)
  const boundaryPolicy = () => Object.values(delivery.findResources('AWS::IAM::ManagedPolicy', { Properties: { ManagedPolicyName: 'hold-permissions-boundary' } }))[0]

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

  it('lets Hold’s roles find faces in a photograph, which the display copies need', () => {
    expect(JSON.stringify(boundaryPolicy())).toContain('rekognition:DetectFaces')
  })

  it('keeps the boundary to what the app needs, and lets it hand on only the scheduler’s role', () => {
    const boundary = JSON.stringify(boundaryPolicy())
    for (const broad of ['"sqs:*"', '"s3:*"', '"cognito-idp:*"', '"secretsmanager:*"', '"rds-data:*"', '"scheduler:*"', 'cloudformation:', 'iam:CreateRole', 'cognito-idp:AdminInitiateAuth', 'cognito-idp:AdminSetUserPassword']) {
      expect(boundary).not.toContain(broad)
    }
    const decrypting = (JSON.parse(boundary) as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement.find(
      (statement) => statement['Resource'] === 'arn:aws:kms:us-east-1:707938860881:key/*' && statement['Action'] === 'kms:Decrypt',
    )
    expect(decrypting).toEqual({ Action: 'kms:Decrypt', Condition: { StringEquals: { 'aws:ResourceTag/project': 'hold' } }, Effect: 'Allow', Resource: 'arn:aws:kms:us-east-1:707938860881:key/*' })
    // Signing Clean Record credentials, with a key of Hold's only.
    const signing = (JSON.parse(boundary) as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement.find((statement) => JSON.stringify(statement['Action']).includes('kms:Sign'))
    expect(signing).toEqual({ Action: ['kms:Sign', 'kms:GetPublicKey'], Condition: { StringEquals: { 'aws:ResourceTag/project': 'hold' } }, Effect: 'Allow', Resource: 'arn:aws:kms:us-east-1:707938860881:key/*' })
    expect(boundary).toContain('role/hold-scheduler')
    expect(boundary).toContain('"iam:PassedToService":"scheduler.amazonaws.com"')
    expect(boundary).not.toContain('role/hold-*')
  })

  it('lets the outbox relay hand a manual operations run, which the web app writes, to the ops-agent queue', () => {
    const relay = resourcesOfType(work, 'AWS::Lambda::Function').find((each) => each.Properties?.['FunctionName'] === 'hold-worker-outbox-relay')
    expect(JSON.stringify(relay?.Properties?.['Environment'])).toContain('HOLD_OPS_AGENT_QUEUE_URL')
    expect(JSON.stringify(relay?.Properties?.['Environment'])).toContain('HOLD_OPS_EXECUTE_QUEUE_URL')
    const sends = Object.entries(work.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('WorkerRole')).map(([, value]) => JSON.stringify(value)).join('')
    expect(sends).toMatch(/OpsAgent|opsagent|ops-agent/i)
  })

  it('runs the operations agent from its own queue and a nightly schedule, with a role that may read PayPal, evidence packs and call the model but write no photograph and schedule nothing', () => {
    expect(JSON.stringify(resourcesOfType(work, 'AWS::Lambda::Function').find((each) => each.Properties?.['FunctionName'] === 'hold-worker-operations-execute')?.Properties?.['Environment'])).toContain('HOLD_EVIDENCE_BUCKET')
    const operationsFunction = (functionName: string) => resourcesOfType(work, 'AWS::Lambda::Function').find((each) => each.Properties?.['FunctionName'] === functionName)
    expect(operationsFunction('hold-worker-operations')?.Properties).toMatchObject({ Runtime: 'nodejs24.x' })
    expect(operationsFunction('hold-worker-operations-nightly')?.Properties).toMatchObject({ Runtime: 'nodejs24.x' })
    expect(operationsFunction('hold-worker-operations-execute')?.Properties).toMatchObject({ Runtime: 'nodejs24.x' })
    const policy = JSON.stringify(Object.entries(work.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith('OperationsRole')).map(([, value]) => value))
    expect(policy).toContain('inference-profile/us.anthropic.claude-opus-4-5-20251101-v1:0')
    expect(policy).toContain('paypal/shops')
    expect(policy).toContain('sqs:SendMessage')
    // A dispute answer attaches the rental's published record: it may read evidence packs, and no photograph.
    expect(policy.match(/s3:[A-Za-z]+/g) ?? []).toEqual(['s3:GetObjectVersion'])
    expect(policy).toContain('/packs/*')
    expect(policy).not.toContain('scheduler:')
    expect(policy).not.toContain('rekognition')
    const schedules = resourcesOfType(work, 'AWS::Scheduler::Schedule').map((each) => each.Properties?.['ScheduleExpression'])
    expect(schedules).toContain('cron(0 2 * * ? *)')
  })

  it('lets CloudFormation change only roles that carry Hold’s tag, and hand on only the web app’s two roles, the code sender’s, the worker’s and the scheduler’s', () => {
    const statements = JSON.stringify(delivery.findResources('AWS::IAM::Policy'))
    expect(statements).toMatch(/iam:UpdateAssumeRolePolicy[^}]*aws:ResourceTag\/project/)

    const passing = Object.values(delivery.findResources('AWS::IAM::Policy'))
      .flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement)
      .filter((statement) => [statement['Action']].flat().includes('iam:PassRole'))
    const allowed = passing.filter((statement) => statement['Effect'] === 'Allow' && JSON.stringify(statement).includes('role/hold-web'))
    expect(allowed).toHaveLength(1)
    expect(new Set([allowed[0]?.['Resource']].flat())).toEqual(new Set(['role/hold-web', 'role/hold-web-access', 'role/hold-code-sender', 'role/hold-worker', 'role/hold-comparison', 'role/hold-negotiation', 'role/hold-evidence', 'role/hold-receipts', 'role/hold-operations', 'role/hold-scheduler', 'role/hold-texts', 'role/hold-demo-cleanup'].map((role) => `arn:aws:iam::707938860881:${role}`)))
    // App Runner checks the pass with a service name of its own choosing, so none is named here. Both roles trust App
    // Runner alone, so no other service could use them.
    expect(allowed[0]?.['Condition']).toBeUndefined()
    for (const role of resourcesOfType(web, 'AWS::IAM::Role')) {
      const principals = (role.Properties?.['AssumeRolePolicyDocument'] as { Statement: { Principal: { Service: string } }[] }).Statement.map((statement) => statement.Principal.Service)
      for (const principal of principals) expect(principal).toMatch(/^(build|tasks)\.apprunner\.amazonaws\.com$/)
    }
    identity.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'hold-code-sender',
      AssumeRolePolicyDocument: { Statement: [Match.objectLike({ Principal: { Service: 'lambda.amazonaws.com' } })] },
    })
    const denied = passing.find((statement) => statement['Effect'] === 'Deny')
    expect(JSON.stringify(denied?.['NotResource'])).toContain('role/hold-web-access')
    expect(JSON.stringify(denied?.['NotResource'])).toContain('role/hold-code-sender')
  })

  it('lets CloudFormation make only App Runner services that carry Hold’s tag, and change only Hold’s', () => {
    const statements = cloudFormationPolicies()
    expect(statements).toMatch(/apprunner:CreateService[^}]*aws:RequestTag\/project/)
    expect(statements).toContain('service/hold-*')
    expect(statements).not.toContain('"apprunner:*"')
  })

  it('lets CloudFormation feed only Hold’s functions from queues, and schedule only in Hold’s groups', () => {
    const statements = [...Object.values(delivery.findResources('AWS::IAM::Policy')), ...Object.values(delivery.findResources('AWS::IAM::ManagedPolicy'))].flatMap(
      (policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement,
    )
    const mapping = statements.find((statement) => [statement['Action']].flat().includes('lambda:CreateEventSourceMapping'))
    expect(JSON.stringify(mapping?.['Condition'])).toContain('function:hold-*')
    const scheduling = statements.find((statement) => [statement['Action']].flat().includes('scheduler:CreateSchedule'))
    expect(scheduling?.['Resource']).toBe('arn:aws:scheduler:us-east-1:707938860881:schedule/hold-*/*')
  })

  it('lets CloudFormation tag a queue trigger only with Hold’s own tag, since tagging one names no function', () => {
    const statements = [...Object.values(delivery.findResources('AWS::IAM::Policy')), ...Object.values(delivery.findResources('AWS::IAM::ManagedPolicy'))].flatMap(
      (policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement,
    )
    const tagging = statements.find((statement) => statement['Resource'] === 'arn:aws:lambda:us-east-1:707938860881:event-source-mapping:*')
    // Only Hold's own two tags, and project set to hold: no other tag can be put on any mapping in the account.
    expect(tagging).toEqual({
      Action: 'lambda:TagResource',
      Condition: {
        StringEquals: { 'aws:RequestTag/project': 'hold', 'aws:RequestTag/managed_by': 'cdk' },
        // CloudFormation adds its own aws: tags, which only AWS can write.
        'ForAllValues:StringLike': { 'aws:TagKeys': ['project', 'managed_by', 'aws:cloudformation:*'] },
      },
      Effect: 'Allow',
      Resource: 'arn:aws:lambda:us-east-1:707938860881:event-source-mapping:*',
    })
  })

  it('lets the boundary start only Hold’s functions, which is all the scheduler’s role needs for the relay', () => {
    const boundary = (boundaryPolicy() as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement
    const invoking = boundary.find((statement) => statement['Action'] === 'lambda:InvokeFunction')
    expect(invoking?.['Resource']).toBe('arn:aws:lambda:us-east-1:707938860881:function:hold-*')
  })

  it('lets the pipeline read the worker’s database login, to give hold_worker its password', () => {
    expect(JSON.stringify(delivery.findResources('AWS::IAM::Policy'))).toContain('secret:hold/database/worker-*')
  })

  it('lets CloudFormation manage only Hold’s Lambda functions and the keys that carry Hold’s tag, and never make or tag a key', () => {
    const statements = cloudFormationPolicies()
    expect(statements).toContain('function:hold-*')
    // Tagging a key at creation needs kms:TagResource, which would let it tag another project's key too. An
    // administrator makes Hold's keys instead.
    expect(statements).not.toContain('kms:CreateKey')
    expect(statements).not.toMatch(/"Effect":"Allow"[^}]*kms:TagResource|kms:TagResource[^}]*"Effect":"Allow"/)
    expect(statements).not.toContain('kms:PutKeyPolicy')
    expect(statements).not.toContain('"lambda:*"')
    expect(statements).not.toContain('"kms:*"')
  })

  it('lets CloudFormation grant Cognito only the right to encrypt codes, so no grant can let anyone decrypt them', () => {
    const granting = Object.values(delivery.findResources('AWS::IAM::Policy'))
      .flatMap((policy) => (policy as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties.PolicyDocument.Statement)
      .filter((statement) => statement['Effect'] === 'Allow' && [statement['Action']].flat().includes('kms:CreateGrant'))
    // The other grant is RDS's and Secrets Manager's, on their own AWS-managed keys for the database.
    const managedByServices = granting.filter((statement) => JSON.stringify(statement['Condition']).includes('"kms:GrantIsForAWSResource":true'))
    expect(managedByServices).toHaveLength(1)
    granting.splice(granting.indexOf(managedByServices[0] ?? {}), 1)

    expect(granting).toHaveLength(1)
    expect(granting[0]?.['Action']).toBe('kms:CreateGrant')
    expect(granting[0]?.['Condition']).toEqual({
      StringEquals: { 'aws:ResourceTag/project': 'hold', 'kms:GranteePrincipal': 'cognito-idp.us-east-1.amazonaws.com' },
      'ForAllValues:StringEquals': { 'kms:GrantOperations': ['Encrypt', 'GenerateDataKey'] },
    })
  })

  it('never lets CloudFormation describe another project’s App Runner service, whose settings it would read', () => {
    const statements = cloudFormationStatements().filter((statement) => statement['Effect'] === 'Allow')
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
    const allowed = JSON.stringify(cloudFormationStatements().filter((entry) => entry.Effect === 'Allow'))
    for (const action of ['s3:*', 'sqs:ReceiveMessage', 'sqs:*', 'secretsmanager:*', 'cognito-idp:*', 'cognito-idp:AdminInitiateAuth', 'rds:*', 'ecr:*', 'kms:Decrypt']) {
      expect(allowed).not.toContain(`"${action}"`)
    }
    expect(allowed).not.toContain('secret:hold/paypal')
    expect(allowed).not.toContain('secret:hold/email')
    // It reads objects only where the deploy keeps its templates and the code sender’s code, never Hold’s buckets.
    const reads = (JSON.parse(allowed) as { Action: unknown; Resource: unknown }[]).filter((statement) => [statement.Action].flat().includes('s3:GetObject'))
    expect(reads.flatMap((statement) => [statement.Resource].flat())).toEqual(['arn:aws:s3:::cdk-hnb659fds-assets-707938860881-us-east-1/hold/*'])
  })

  it('deploys every stack with the caller’s credentials, under Hold’s prefix in the bootstrap bucket', () => {
    for (const template of all) expect(JSON.stringify(template.toJSON())).not.toContain('cdk-hnb659fds-deploy-role')
  })
})
