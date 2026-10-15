import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'

// The SMTP account Hold sends email through, kept as one JSON secret in Secrets Manager and never in a setting.
const smtpSettings = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  user: z.email(),
  password: z.string().min(1),
})

export type SmtpSettings = z.infer<typeof smtpSettings>

// The client is passed in only by tests.
export async function loadSmtpSettings(
  secretId: string,
  region: string,
  client: Pick<SecretsManagerClient, 'send'> = new SecretsManagerClient({ region }),
): Promise<SmtpSettings> {
  const secret = await client.send(new GetSecretValueCommand({ SecretId: secretId }))
  if (secret.SecretString === undefined || secret.SecretString === '') throw new Error('The SMTP secret is empty.')
  const parsed = smtpSettings.safeParse(JSON.parse(secret.SecretString))
  if (!parsed.success) {
    // Names the parts that are wrong, never their values.
    const parts = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')
    throw new Error(`The SMTP secret is missing or has wrong: ${parts}.`)
  }
  return parsed.data
}
