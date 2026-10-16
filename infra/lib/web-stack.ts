import { CfnOutput, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as apprunner from 'aws-cdk-lib/aws-apprunner'
import type * as cognito from 'aws-cdk-lib/aws-cognito'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import * as iam from 'aws-cdk-lib/aws-iam'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { ACCOUNT, DATABASE_NAME, name, REGION, secretName, SMTP_SECRET_NAME } from './settings.ts'
import type * as sqs from 'aws-cdk-lib/aws-sqs'

// The web app on App Runner (tech-stack.md section 8): one container service with its own HTTPS address, no load
// balancer, NAT gateway or VPC. It runs the image CI built from a commit, named by the deploy, and changes only
// when a deploy names a new one.

const PORT = 3000
// Two instances at most, so a burst of traffic cannot run up the bill through judging (tech-stack.md section 18).
const MAX_INSTANCES = 2

export type WebResources = {
  readonly stack: Stack
  readonly service: apprunner.CfnService
}

export type WebStackProps = StackProps & {
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
  // The worker's queues the app hands work to at once.
  readonly queues: ReadonlyMap<string, sqs.IQueue>
}

// The queues the app hands work to: executions to capture, and the PayPal events it has stored.
const HANDED_ON = ['executions', 'paypal-events'] as const

function queueOf(props: WebStackProps, queueName: string): sqs.IQueue {
  const queue = props.queues.get(queueName)
  if (queue === undefined) throw new Error(`No ${queueName} queue.`)
  return queue
}

// What the running app may do, and no more: query the database as hold_app, read its secrets, keep each shop's PayPal
// credentials and put a new owner in the owner group. Email goes out through the SMTP account, not SES.
function instanceRole(stack: Stack, props: WebStackProps): iam.Role {
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
  role.addToPolicy(new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [props.appUserSecret.secretArn, props.cookieKey.secretArn, props.renterLinkKey.secretArn, paypalCredentials, smtpLogin] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['secretsmanager:CreateSecret', 'secretsmanager:PutSecretValue', 'secretsmanager:TagResource'], resources: [paypalCredentials] }))
  role.addToPolicy(new iam.PolicyStatement({ actions: ['cognito-idp:AdminAddUserToGroup'], resources: [props.userPool.userPoolArn] }))
  for (const queueName of HANDED_ON) queueOf(props, queueName).grantSendMessages(role)
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
    HOLD_SMTP_SECRET: SMTP_SECRET_NAME,
    HOLD_EXECUTIONS_QUEUE_URL: queueOf(props, 'executions').queueUrl,
    HOLD_PAYPAL_EVENTS_QUEUE_URL: queueOf(props, 'paypal-events').queueUrl,
    ...(props.publicUrl === undefined ? {} : { HOLD_PUBLIC_URL: props.publicUrl }),
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
        imageConfiguration: { port: String(PORT), runtimeEnvironmentVariables: settings(props) },
      },
    },
    instanceConfiguration: { cpu: '1 vCPU', memory: '2 GB', instanceRoleArn: instanceRole(stack, props).roleArn },
    autoScalingConfigurationArn: scaling.attrAutoScalingConfigurationArn,
    healthCheckConfiguration: { protocol: 'TCP' },
  })

  new CfnOutput(stack, 'ServiceUrl', { value: `https://${service.attrServiceUrl}` })
  return { stack, service }
}
