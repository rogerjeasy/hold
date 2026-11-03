import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as apprunner from 'aws-cdk-lib/aws-apprunner'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import type * as cognito from 'aws-cdk-lib/aws-cognito'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import * as iam from 'aws-cdk-lib/aws-iam'
import type * as s3 from 'aws-cdk-lib/aws-s3'
import type * as rds from 'aws-cdk-lib/aws-rds'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { allowPushes, PUSH_ENVIRONMENT } from './pushes.ts'
import { allowTexting, textEnvironment } from './texts.ts'
import type { TextSettings } from './texts.ts'
import { ACCOUNT, CLAUDE_INVOKE_ACTIONS, CLAUDE_INVOKE_RESOURCES, CREDENTIAL_KEY_ALIAS, DATABASE_NAME, name, PREFIX, REGION, secretName, SMTP_SECRET_NAME } from './settings.ts'
import type * as sns from 'aws-cdk-lib/aws-sns'
import type * as sqs from 'aws-cdk-lib/aws-sqs'
import { reportTo } from './alarms.ts'

// The web app on App Runner (tech-stack.md section 8): one container service with its own HTTPS address, no load
// balancer, NAT gateway or VPC. It runs the image CI built from a commit, named by the deploy, and changes only
// when a deploy names a new one.

const PORT = 3000
// Two instances at most, so a burst of traffic cannot run up the bill through judging (tech-stack.md section 18).
const MAX_INSTANCES = 2
// The app's health check route (apps/web/src/app/api/health/route.ts): it answers without the database, which pauses
// when idle and would make a healthy server look failed while it resumed.
const HEALTH_CHECK_PATH = '/api/health'
// One server error can be a stray request; three in five minutes means a page is failing for the people using it.
const SERVER_ERRORS_PER_FIVE_MINUTES = 3

export type WebResources = {
  readonly stack: Stack
  readonly service: apprunner.CfnService
}

export type WebStackProps = StackProps & {
  readonly texts: TextSettings
  readonly evidenceBucket: s3.IBucket
  readonly displayBucket: s3.IBucket
  readonly repository: ecr.IRepository
  // The commit CI passed on. Its image is in the repository, tagged with it.
  readonly imageTag: string
  // The service's own address, for the links in Hold's emails. App Runner gives it only once the service exists,
  // so the first deploy leaves it out and the app falls back to its default.
  readonly publicUrl: string | undefined
  readonly cluster: rds.IDatabaseCluster
  readonly appUserSecret: secretsmanager.ISecret
  readonly userPool: cognito.IUserPool
  readonly webClient: cognito.IUserPoolClient
  readonly cookieKey: secretsmanager.ISecret
  readonly renterLinkKey: secretsmanager.ISecret
  // Makes renter keys for the Clean Record.
  readonly trustKey: secretsmanager.ISecret
  // The worker's queues the app hands work to at once.
  readonly queues: ReadonlyMap<string, sqs.IQueue>
  // Where the web app's alarm reports (infra/lib/alarms.ts).
  readonly alarmTopic: sns.ITopic
}

// The queues the app hands work to: executions to capture, and the PayPal events it has stored.
const HANDED_ON = ['executions', 'paypal-events', 'media', 'comparisons', 'evidence', 'negotiations'] as const

function queueOf(props: WebStackProps, queueName: string): sqs.IQueue {
  const queue = props.queues.get(queueName)
  if (queue === undefined) throw new Error(`No ${queueName} queue.`)
  return queue
}

// What the running app may do, and no more: query the database as hold_app, read its secrets, keep each shop's PayPal
// credentials and put a new owner in the owner group. Email goes out through the SMTP account, not SES.
function instanceRole(stack: Stack, props: WebStackProps, licences: readonly secretsmanager.ISecret[]): iam.Role {
  const role = new iam.Role(stack, 'InstanceRole', {
    roleName: name('web'),
    description: 'The Hold web app, as it runs on App Runner',
    assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
  })
  const paypalCredentials = `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${secretName('paypal', 'shops')}/*`
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['rds-data:ExecuteStatement', 'rds-data:BatchExecuteStatement', 'rds-data:BeginTransaction', 'rds-data:CommitTransaction', 'rds-data:RollbackTransaction'],
      resources: [props.cluster.clusterArn],
    }),
  )
  // Secrets Manager adds six random characters to a secret's name in its ARN.
  const smtpLogin = `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${SMTP_SECRET_NAME}-??????`
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.appUserSecret.secretArn, props.cookieKey.secretArn, props.renterLinkKey.secretArn, props.trustKey.secretArn, paypalCredentials, smtpLogin, ...licences.map((licence) => licence.secretArn)],
    }),
  )
  role.addToPolicy(new iam.PolicyStatement({ actions: ['secretsmanager:CreateSecret', 'secretsmanager:PutSecretValue', 'secretsmanager:TagResource'], resources: [paypalCredentials] }))
  // A demo session's two users are created here (architecture.md section 20.3); their own first sign-in sets their
  // passwords, so the app never sets one with administrator rights.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminCreateUser'], resources: [props.userPool.userPoolArn] }))
  // Clean Record credentials: sign with the credential key, by ES256 only, and read its public key to publish it. The
  // key is an administrator's (settings.ts), reached through its alias, and must carry Hold's tag.
  const credentialKey = { 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': CREDENTIAL_KEY_ALIAS } }
  const keys = `arn:aws:kms:${REGION}:${ACCOUNT}:key/*`
  role.addToPolicy(new iam.PolicyStatement({ actions: ['kms:Sign'], resources: [keys], conditions: { StringEquals: { 'aws:ResourceTag/project': PREFIX, 'kms:SigningAlgorithm': 'ECDSA_SHA_256' }, ...credentialKey } }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['kms:GetPublicKey'], resources: [keys], conditions: { StringEquals: { 'aws:ResourceTag/project': PREFIX }, ...credentialKey } }))
  for (const queueName of HANDED_ON) queueOf(props, queueName).grantSendMessages(role)
  // Photographs: the phone puts each original through a link the app signs, and the app reads back what arrived. The
  // app reads display copies to sign links to them. It deletes nothing; Object Lock would refuse it anyway.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:PutObject', 's3:GetObject'], resources: [props.evidenceBucket.arnForObjects('*')] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObjectVersion'], resources: [props.evidenceBucket.arnForObjects('packs/*')] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [props.displayBucket.arnForObjects('*')] }))
  // Sorting a renter's incident report: one Claude call with no tools, while the renter waits (extensions.md section 10).
  // The hosted assistant (section 8.10) uses the same model; its tools are Hold's MCP server, reached over HTTP.
  // Mantle authorizes by model condition rather than model ARN, as for the comparison worker.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'], conditions: { StringEquals: { 'aws:RequestedRegion': REGION, 'bedrock-mantle:Model': ['anthropic.claude-opus-5-5', 'anthropic.claude-opus-4-8'] } } }))
  role.addToPolicy(new iam.PolicyStatement({ actions: CLAUDE_INVOKE_ACTIONS, resources: CLAUDE_INVOKE_RESOURCES }))
  // Links, notices and one-time codes to a renter who chose texts (architecture.md section 12.3).
  allowTexting(role)
  // Notices to the phones registered in Hold's app (architecture.md section 13.9).
  allowPushes(role)
  return role
}

function settings(props: WebStackProps): apprunner.CfnService.KeyValuePairProperty[] {
  const values: Record<string, string> = {
    HOLD_ENVIRONMENT: 'production',
    HOLD_AWS_REGION: REGION,
    HOLD_COGNITO_USER_POOL_ID: props.userPool.userPoolId,
    HOLD_COGNITO_CLIENT_ID: props.webClient.userPoolClientId,
    HOLD_DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
    HOLD_DATABASE_SECRET_ARN: props.appUserSecret.secretArn,
    HOLD_DATABASE_NAME: DATABASE_NAME,
    HOLD_COOKIE_KEY_SECRET_ARN: props.cookieKey.secretArn,
    HOLD_RENTER_LINK_KEY_SECRET_ARN: props.renterLinkKey.secretArn,
    HOLD_TRUST_KEY_SECRET_ARN: props.trustKey.secretArn,
    HOLD_CREDENTIAL_KEY_ID: CREDENTIAL_KEY_ALIAS,
    HOLD_SMTP_SECRET: SMTP_SECRET_NAME,
    // A judge starts a demo of their own from the sign-in page. Drop this once judging ends, and it offers none.
    HOLD_DEMO_SESSIONS: 'on',
    HOLD_EXECUTIONS_QUEUE_URL: queueOf(props, 'executions').queueUrl,
    HOLD_PAYPAL_EVENTS_QUEUE_URL: queueOf(props, 'paypal-events').queueUrl,
    HOLD_MEDIA_QUEUE_URL: queueOf(props, 'media').queueUrl,
    HOLD_COMPARISONS_QUEUE_URL: queueOf(props, 'comparisons').queueUrl,
    HOLD_EVIDENCE_QUEUE_URL: queueOf(props, 'evidence').queueUrl,
    HOLD_NEGOTIATIONS_QUEUE_URL: queueOf(props, 'negotiations').queueUrl,
    HOLD_EVIDENCE_BUCKET: props.evidenceBucket.bucketName,
    HOLD_DISPLAY_BUCKET: props.displayBucket.bucketName,
    ...(props.publicUrl === undefined ? {} : { HOLD_PUBLIC_URL: props.publicUrl }),
    ...textEnvironment(props.texts),
    ...PUSH_ENVIRONMENT,
  }
  return Object.entries(values).map(([key, value]) => ({ name: key, value }))
}

export function createWebStack(app: App, props: WebStackProps): WebResources {
  // App Runner gives each new service a new address, so deleting this stack would break every link to Hold.
  const stack = new Stack(app, 'HoldWeb', { ...props, terminationProtection: true, description: 'Hold: the web app' })

  const accessRole = new iam.Role(stack, 'AccessRole', {
    roleName: name('web', 'access'),
    description: 'App Runner pulls the Hold image with this, and does nothing else',
    assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
  })
  props.repository.grantPull(accessRole)

  // The AG Grid Enterprise licence key. An administrator puts the key AG Grid sent into it; until then it holds a
  // random value, and the grids work with AG Grid's watermark. Kept if the stack goes, like the other web keys.
  const gridLicence = new secretsmanager.Secret(stack, 'GridLicence', {
    secretName: secretName('web', 'ag-grid-licence'),
    description: 'Hold: the AG Grid Enterprise licence key',
    removalPolicy: RemovalPolicy.RETAIN,
  })
  // The AG Studio licence key, for the insights dashboard: a licence of its own, filled in the same way.
  const studioLicence = new secretsmanager.Secret(stack, 'StudioLicence', {
    secretName: secretName('web', 'ag-studio-licence'),
    description: 'Hold: the AG Studio licence key',
    removalPolicy: RemovalPolicy.RETAIN,
  })

  const scaling = new apprunner.CfnAutoScalingConfiguration(stack, 'Scaling', {
    autoScalingConfigurationName: name('web'),
    minSize: 1,
    maxSize: MAX_INSTANCES,
  })

  const service = new apprunner.CfnService(stack, 'Service', {
    serviceName: name('web'),
    sourceConfiguration: {
      autoDeploymentsEnabled: false,
      authenticationConfiguration: { accessRoleArn: accessRole.roleArn },
      imageRepository: {
        imageRepositoryType: 'ECR',
        imageIdentifier: `${props.repository.repositoryUri}:${props.imageTag}`,
        // The AG Grid and AG Studio licence keys are read from their secrets as the service starts, so they are in no file or setting.
        imageConfiguration: { port: String(PORT), runtimeEnvironmentVariables: settings(props), runtimeEnvironmentSecrets: [{ name: 'HOLD_AG_GRID_LICENCE_KEY', value: gridLicence.secretArn }, { name: 'HOLD_AG_STUDIO_LICENCE_KEY', value: studioLicence.secretArn }] },
      },
    },
    instanceConfiguration: { cpu: '1 vCPU', memory: '2 GB', instanceRoleArn: instanceRole(stack, props, [gridLicence, studioLicence]).roleArn },
    autoScalingConfigurationArn: scaling.attrAutoScalingConfigurationArn,
    // Over HTTP, so a server that accepts connections but cannot answer is replaced. Ten seconds between checks and five
    // to answer leave room for a busy instance; five misses in a row, under a minute, mark it unhealthy.
    healthCheckConfiguration: { protocol: 'HTTP', path: HEALTH_CHECK_PATH, interval: 10, timeout: 5, healthyThreshold: 1, unhealthyThreshold: 5 },
  })

  reportTo(
    props.alarmTopic,
    new cloudwatch.Alarm(stack, 'ServerErrorsAlarm', {
      alarmName: name('web', 'server', 'errors'),
      alarmDescription: `The web app answered ${String(SERVER_ERRORS_PER_FIVE_MINUTES)} or more requests with a server error in five minutes.`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppRunner',
        metricName: '5xxStatusResponses',
        dimensionsMap: { ServiceName: service.serviceName ?? name('web'), ServiceID: service.attrServiceId },
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      threshold: SERVER_ERRORS_PER_FIVE_MINUTES,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      // App Runner reports nothing for a quiet period, and quiet is not failing.
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
  )

  new CfnOutput(stack, 'ServiceUrl', { value: `https://${service.attrServiceUrl}` })
  return { stack, service }
}
