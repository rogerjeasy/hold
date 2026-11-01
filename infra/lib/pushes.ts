import * as iam from 'aws-cdk-lib/aws-iam'
import { ACCOUNT, REGION, secretName } from './settings.ts'

// Push notifications to Hold's phone app go through Expo's push service over HTTPS (architecture.md section 13.9),
// with an Expo access token an administrator puts in this secret. Until it exists, pushes go without one.
export const PUSH_SECRET_NAME = secretName('notify', 'expo-push-access-token')

export function allowPushes(role: iam.Role): void {
  // Secrets Manager adds six random characters to a secret's name in its ARN.
  role.addToPolicy(new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [`arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${PUSH_SECRET_NAME}-??????`] }))
}

export const PUSH_ENVIRONMENT = { HOLD_PUSH_SECRET: PUSH_SECRET_NAME } as const
