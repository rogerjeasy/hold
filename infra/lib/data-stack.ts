import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import {
  ACCOUNT,
  DATABASE_ADMIN_USER,
  DATABASE_APP_USER,
  DATABASE_EVAL_USER,
  DATABASE_WORKER_USER,
  DATABASE_MAX_CAPACITY,
  DATABASE_MIN_CAPACITY,
  DATABASE_NAME,
  BACKUP_KEPT_DAYS,
  EVIDENCE_KEPT_DAYS,
  EVIDENCE_LOCK_DAYS,
  name,
  secretName,
} from './settings.ts'

// Hold's stateful resources: its own Aurora cluster and its two photograph buckets. Everything here is retained if
// the stack is deleted, and the stack itself has termination protection.

export type DataResources = {
  readonly stack: Stack
  readonly cluster: rds.DatabaseCluster
  readonly appUserSecret: rds.DatabaseSecret
  readonly workerUserSecret: rds.DatabaseSecret
  readonly evidenceBucket: s3.Bucket
  readonly displayBucket: s3.Bucket
}

function createDatabase(stack: Stack) {
  // The account's default VPC. Its subnets are public, but the cluster takes no public address and its security
  // group lets nothing in. Hold reaches it only through the RDS Data API, over HTTPS and signed with IAM.
  const vpc = ec2.Vpc.fromLookup(stack, 'DefaultVpc', { isDefault: true })
  const securityGroup = new ec2.SecurityGroup(stack, 'DatabaseSecurityGroup', {
    vpc,
    securityGroupName: name('database'),
    description: 'Hold database. No inbound rules: access is through the RDS Data API only.',
    allowAllOutbound: false,
  })

  const cluster = new rds.DatabaseCluster(stack, 'Database', {
    clusterIdentifier: name('database'),
    engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_9 }),
    writer: rds.ClusterInstance.serverlessV2('Writer', { instanceIdentifier: name('database', 'writer'), publiclyAccessible: false }),
    serverlessV2MinCapacity: DATABASE_MIN_CAPACITY,
    serverlessV2MaxCapacity: DATABASE_MAX_CAPACITY,
    enableDataApi: true,
    defaultDatabaseName: DATABASE_NAME,
    credentials: rds.Credentials.fromGeneratedSecret(DATABASE_ADMIN_USER, { secretName: secretName('database', 'admin') }),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    securityGroups: [securityGroup],
    storageEncrypted: true,
    backup: { retention: Duration.days(BACKUP_KEPT_DAYS) },
    deletionProtection: true,
    removalPolicy: RemovalPolicy.RETAIN,
  })

  // The application's own login. Migrations create the role with this password and grant it only what it needs.
  const appUserSecret = new rds.DatabaseSecret(stack, 'AppUserSecret', {
    secretName: secretName('database', 'app'),
    username: DATABASE_APP_USER,
    dbname: DATABASE_NAME,
    masterSecret: cluster.secret,
  })
  appUserSecret.applyRemovalPolicy(RemovalPolicy.RETAIN)

  // The worker's own login (architecture.md section 12.2). Migrations give hold_worker this password.
  const workerUserSecret = new rds.DatabaseSecret(stack, 'WorkerUserSecret', {
    secretName: secretName('database', 'worker'),
    username: DATABASE_WORKER_USER,
    dbname: DATABASE_NAME,
    masterSecret: cluster.secret,
  })
  workerUserSecret.applyRemovalPolicy(RemovalPolicy.RETAIN)

  // The evaluation runner's login, which may only record and read runs of the scorecard. Migrations give it this password.
  const evalUserSecret = new rds.DatabaseSecret(stack, 'EvalUserSecret', {
    secretName: secretName('database', 'eval'),
    username: DATABASE_EVAL_USER,
    dbname: DATABASE_NAME,
    masterSecret: cluster.secret,
  })
  evalUserSecret.applyRemovalPolicy(RemovalPolicy.RETAIN)

  return { cluster, appUserSecret, workerUserSecret }
}

function createEvidenceBucket(stack: Stack, publicUrl: string): s3.Bucket {
  // Object Lock can only be switched on when a bucket is created (tech-stack.md section 16, item 8).
  return new s3.Bucket(stack, 'EvidenceBucket', {
    bucketName: name('evidence', ACCOUNT),
    objectLockEnabled: true,
    objectLockDefaultRetention: s3.ObjectLockRetention.governance(Duration.days(EVIDENCE_LOCK_DAYS)),
    versioned: true,
    encryption: s3.BucketEncryption.KMS_MANAGED,
    bucketKeyEnabled: true,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    lifecycleRules: [
      { id: 'abort-incomplete-uploads', abortIncompleteMultipartUploadAfter: Duration.days(7) },
      // The period the privacy notice states. The day's rule hides each object behind a delete marker; the next removes
      // the version itself. S3 removes no version while its Object Lock retention runs, so nothing goes before the lock ends.
      { id: 'delete-after-retention', expiration: Duration.days(EVIDENCE_KEPT_DAYS), noncurrentVersionExpiration: Duration.days(1) },
      { id: 'remove-expired-delete-markers', expiredObjectDeleteMarker: true },
    ],
    // The phone puts each photograph here itself, through a signed link, from the web app's own pages only.
    cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: [publicUrl], allowedHeaders: ['content-type', 'x-amz-checksum-sha256'], maxAge: 300 }],
    removalPolicy: RemovalPolicy.RETAIN,
  })
}

function createDisplayBucket(stack: Stack): s3.Bucket {
  // Smaller, face-blurred copies, served through short-lived signed links. They can be made again from the evidence.
  return new s3.Bucket(stack, 'DisplayBucket', {
    bucketName: name('display', ACCOUNT),
    encryption: s3.BucketEncryption.KMS_MANAGED,
    bucketKeyEnabled: true,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    lifecycleRules: [
      { id: 'abort-incomplete-uploads', abortIncompleteMultipartUploadAfter: Duration.days(7) },
      // Gone with the photographs they were made from.
      { id: 'delete-after-retention', expiration: Duration.days(EVIDENCE_KEPT_DAYS) },
    ],
    removalPolicy: RemovalPolicy.RETAIN,
  })
}

// The web app's own address, from which phones put photographs.
export type DataStackProps = StackProps & { readonly publicUrl: string }

export function createDataStack(app: App, props: DataStackProps): DataResources {
  const stack = new Stack(app, 'HoldData', { ...props, terminationProtection: true, description: 'Hold: database and photograph storage' })
  const { cluster, appUserSecret, workerUserSecret } = createDatabase(stack)
  const evidenceBucket = createEvidenceBucket(stack, props.publicUrl)
  const displayBucket = createDisplayBucket(stack)

  new CfnOutput(stack, 'DatabaseClusterArn', { value: cluster.clusterArn })
  new CfnOutput(stack, 'DatabaseAppSecretArn', { value: appUserSecret.secretArn })
  new CfnOutput(stack, 'EvidenceBucketName', { value: evidenceBucket.bucketName })
  new CfnOutput(stack, 'DisplayBucketName', { value: displayBucket.bucketName })

  new CfnOutput(stack, 'DatabaseWorkerSecretArn', { value: workerUserSecret.secretArn })

  return { stack, cluster, appUserSecret, workerUserSecret, evidenceBucket, displayBucket }
}
