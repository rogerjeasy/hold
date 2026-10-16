import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { createCodeSender } from './code-sender.ts'
import { name, REGION, secretName } from './settings.ts'

// Owners and staff (tech-stack.md section 9.1). A pool of Hold's own, so no account, message or setting is shared
// with another project in the account. Renters have no account here.

export const ACCOUNT_TYPES = ['owner', 'staff', 'platform_admin'] as const

export type IdentityResources = {
  readonly stack: Stack
  readonly userPool: cognito.UserPool
  readonly webClient: cognito.UserPoolClient
  readonly cookieKey: secretsmanager.Secret
  readonly renterLinkKey: secretsmanager.Secret
}

export type IdentityStackProps = StackProps & {
  // The address sign-in codes are sent from, through Amazon SES, which Cognito needs to send codes. It must already
  // be a verified SES identity in the account. It is verified outside this stack, so other projects may share it.
  readonly senderEmail: string
  // The domain passkeys are made for: the web app's own (bin/hold.ts).
  readonly passkeyRelyingPartyId: string
}

export function createIdentityStack(app: App, props: IdentityStackProps): IdentityResources {
  const { senderEmail, passkeyRelyingPartyId, ...stackProps } = props
  const stack = new Stack(app, 'HoldIdentity', { ...stackProps, terminationProtection: true, description: 'Hold: owner and staff accounts' })

  const codeSender = createCodeSender(stack)
  const userPool = new cognito.UserPool(stack, 'UserPool', {
    userPoolName: name('staff'),
    // Choice-based sign-in, so a person can sign in with a code sent by email, or a passkey, and never set a password.
    // Cognito requires the password factor to stay listed. No account is ever given a password.
    featurePlan: cognito.FeaturePlan.ESSENTIALS,
    signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true, passkey: true } },
    // A passkey with user verification is the device and the person's fingerprint, face or PIN together, so it is
    // multi-factor on its own. Owners and managers confirm with one before acting (architecture.md section 12.1).
    passkeyRelyingPartyId,
    passkeyUserVerification: cognito.PasskeyUserVerification.REQUIRED,
    signInAliases: { email: true },
    signInCaseSensitive: false,
    selfSignUpEnabled: true,
    standardAttributes: { email: { required: true, mutable: true } },
    keepOriginal: { email: true },
    // Off. Cognito's second factors follow a password: a person who turns on an authenticator app can no longer
    // sign in with an emailed code. The second factor is the passkey above.
    mfa: cognito.Mfa.OFF,
    accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    // Codes go to Hold's own sender, which emails them through Hold's SMTP account, so they reach any address. Cognito
    // still needs an SES identity for email codes to be allowed at all; it sends nothing through it.
    email: cognito.UserPoolEmail.withSES({ fromEmail: senderEmail, fromName: 'Hold', sesRegion: REGION }),
    customSenderKmsKey: codeSender.key,
    lambdaTriggers: { customEmailSender: codeSender.function },
    userVerification: {
      emailSubject: 'Your Hold code',
      emailBody: 'Your Hold code is {####}. Enter it on the page that asked for it. If you did not ask for it, you can ignore this email.',
      emailStyle: cognito.VerificationEmailStyle.CODE,
    },
    deletionProtection: true,
    removalPolicy: RemovalPolicy.RETAIN,
  })

  // Who a person is. What they may do in a shop is in the database, checked on every request (section 9.2).
  for (const accountType of ACCOUNT_TYPES) {
    new cognito.UserPoolGroup(stack, `Group-${accountType}`, { userPool, groupName: accountType })
  }

  // The web app's server calls Cognito for the person at the counter. A public client: every flow it allows
  // still needs the code from the person's own inbox.
  const webClient = userPool.addClient('WebClient', {
    userPoolClientName: name('web'),
    generateSecret: false,
    authFlows: { user: true },
    preventUserExistenceErrors: true,
    // From sending a code to typing it in. Cognito's default of three minutes is too short for a person who has to
    // find the email first. Fifteen is Cognito's longest.
    authSessionValidity: Duration.minutes(10),
    accessTokenValidity: Duration.minutes(60),
    idTokenValidity: Duration.minutes(60),
    // Long enough that a phone at the counter stays signed in through a season.
    refreshTokenValidity: Duration.days(30),
  })

  // Seals the cookie that carries a sign-in between its two steps. The web app reads it at start-up and derives its
  // key from it, so the key is in no file, image or setting.
  const cookieKey = new secretsmanager.Secret(stack, 'CookieKey', {
    secretName: secretName('web', 'cookie-key'),
    description: 'Hold: seals the sign-in cookie',
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN,
  })

  // Signs renter links. Apart from the cookie key, so the worker can sign the links it emails, such as a request for a
  // new hold, without being able to seal a sign-in. The web app and the worker read it.
  const renterLinkKey = new secretsmanager.Secret(stack, 'RenterLinkKey', {
    secretName: secretName('web', 'renter-link-key'),
    description: 'Hold: signs renter links',
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN,
  })

  new CfnOutput(stack, 'UserPoolId', { value: userPool.userPoolId })
  new CfnOutput(stack, 'CookieKeySecretArn', { value: cookieKey.secretArn })
  new CfnOutput(stack, 'WebClientId', { value: webClient.userPoolClientId })

  new CfnOutput(stack, 'RenterLinkKeySecretArn', { value: renterLinkKey.secretArn })

  return { stack, userPool, webClient, cookieKey, renterLinkKey }
}
