import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node'
import { createLazyMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import { z } from 'zod'
import { createCodeSender } from './code-sender.ts'

// The Lambda function Cognito calls as its custom email sender (infra/lib/code-sender.ts). Its settings come from
// the function's environment; the SMTP login comes from Secrets Manager when the first code is sent.
const settings = z
  .object({
    AWS_REGION: z.string().min(1),
    HOLD_CODE_KEY_ARN: z.string().startsWith('arn:aws:kms:'),
    HOLD_SMTP_SECRET: z.string().min(1),
  })
  .parse(process.env)

// Cognito encrypts with the AWS Encryption SDK under Hold's key. Only that key is trusted to decrypt.
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT)
const keyring = new KmsKeyringNode({ keyIds: [settings.HOLD_CODE_KEY_ARN] })

export const handler = createCodeSender({
  decrypt: async (encrypted) => (await decrypt(keyring, Buffer.from(encrypted, 'base64'))).plaintext.toString('utf8'),
  mailer: createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(settings.HOLD_SMTP_SECRET, settings.AWS_REGION))),
})
