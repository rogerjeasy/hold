import { codeEmail } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { z } from 'zod'

// Cognito's custom email sender (architecture.md section 12.1). Cognito makes each one-time code, encrypts it with
// Hold's KMS key and hands it here instead of sending it. This decrypts it and emails it through Hold's SMTP account.
// The code and the address are never logged.

// The triggers that carry a code Hold's sign-up and sign-in use. Any other is a mistake in the pool's setup.
const CODE_TRIGGERS = ['CustomEmailSender_SignUp', 'CustomEmailSender_ResendCode', 'CustomEmailSender_Authentication'] as const

const customEmailSenderEvent = z.object({
  triggerSource: z.string(),
  request: z.object({
    code: z.string().min(1),
    userAttributes: z.object({ email: z.email() }),
  }),
})

export type CodeSenderDependencies = {
  // Turns the code Cognito encrypted back into the digits the person types.
  readonly decrypt: (encrypted: string) => Promise<string>
  readonly mailer: Mailer
}

function sendsCode(trigger: string): trigger is (typeof CODE_TRIGGERS)[number] {
  return (CODE_TRIGGERS as readonly string[]).includes(trigger)
}

export function createCodeSender({ decrypt, mailer }: CodeSenderDependencies) {
  return async (event: unknown): Promise<void> => {
    const parsed = customEmailSenderEvent.safeParse(event)
    if (!parsed.success) throw new Error('Not a custom email sender event with a code and an address.')
    const { triggerSource, request } = parsed.data
    if (!sendsCode(triggerSource)) throw new Error(`Hold sends no email for ${triggerSource}.`)

    const sent = await mailer.send(codeEmail(request.userAttributes.email, await decrypt(request.code)))
    // Thrown, so Cognito fails the request instead of telling the person a code is on its way.
    if (!sent) throw new Error('The code email was not sent.')
    console.log(JSON.stringify({ event: 'code_sent', trigger: triggerSource }))
  }
}
