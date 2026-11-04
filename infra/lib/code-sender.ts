import { join } from 'node:path'
import { Duration } from 'aws-cdk-lib'
import type { Stack } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { functionLogGroup } from './log-groups.ts'
import { ACCOUNT, CODE_KEY_ARN, name, REGION, SMTP_SECRET_NAME } from './settings.ts'

// Cognito's custom email sender (apps/worker/src/code-sender.ts). Cognito encrypts each sign-up and sign-in code with
// Hold's key and hands it to this function, which emails it through Hold's SMTP account, so codes reach any address
// without Amazon SES. The SMTP login and the key are an administrator's (tech-stack.md section 9.1); only their names
// are here.

const REPO_ROOT = join(import.meta.dirname, '..', '..')

export type CodeSender = {
  readonly key: kms.IKey
  readonly function: nodejs.NodejsFunction
}

export function createCodeSender(stack: Stack): CodeSender {
  const key = kms.Key.fromKeyArn(stack, 'CodeKey', CODE_KEY_ARN)

  const functionName = name('code', 'sender')
  // Its own role, with no managed policy: decrypting codes, reading the SMTP login and writing its own logs.
  const role = new iam.Role(stack, 'CodeSenderRole', {
    roleName: name('code', 'sender'),
    // IAM takes only Latin-1 here, so no typographic apostrophe.
    description: 'The function that emails the codes Cognito makes, and nothing else',
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  })
  key.grantDecrypt(role)
  secretsmanager.Secret.fromSecretNameV2(stack, 'SmtpLogin', SMTP_SECRET_NAME).grantRead(role)
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${functionName}:*`],
    }),
  )

  const sender = new nodejs.NodejsFunction(stack, 'CodeSender', {
    functionName,
    description: 'Hold: emails the sign-up and sign-in codes Cognito makes',
    entry: join(REPO_ROOT, 'apps', 'worker', 'src', 'code-sender-lambda.ts'),
    projectRoot: REPO_ROOT,
    depsLockFilePath: join(REPO_ROOT, 'pnpm-lock.yaml'),
    runtime: lambda.Runtime.NODEJS_24_X,
    memorySize: 256,
    // Long enough to read the secret and reach the SMTP server on a cold start. Cognito waits no longer than this.
    timeout: Duration.seconds(10),
    role,
    logGroup: functionLogGroup(stack, 'CodeSender', functionName, role),
    environment: { HOLD_CODE_KEY_ARN: key.keyArn, HOLD_SMTP_SECRET: SMTP_SECRET_NAME },
    bundling: { minify: true, sourceMap: false },
  })

  return { key, function: sender }
}
