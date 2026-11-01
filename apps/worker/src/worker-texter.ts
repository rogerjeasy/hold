import { createAwsTexter } from '@hold/notify'
import type { Texter } from '@hold/notify'
import { z } from 'zod'

// The worker's texts to renters through AWS End User Messaging (architecture.md section 12.3), set by infra: the sender
// and the configuration set that reports deliveries. Unset, AWS chooses the sender and reports nothing back.
const schema = z.object({
  AWS_REGION: z.string().min(1),
  HOLD_TEXT_SENDER: z.string().min(1).max(200).optional(),
  HOLD_TEXT_CONFIGURATION_SET: z.string().min(1).max(200).optional(),
})

export function workerTexter(environment: Readonly<Record<string, string | undefined>>, client?: Parameters<typeof createAwsTexter>[0]['client']): Texter {
  const parsed = schema.safeParse(environment)
  if (!parsed.success) throw new Error(`The worker's text settings are wrong: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}.`)
  const value = parsed.data
  return createAwsTexter({
    region: value.AWS_REGION,
    ...(value.HOLD_TEXT_SENDER === undefined ? {} : { originationIdentity: value.HOLD_TEXT_SENDER }),
    ...(value.HOLD_TEXT_CONFIGURATION_SET === undefined ? {} : { configurationSet: value.HOLD_TEXT_CONFIGURATION_SET }),
    ...(client === undefined ? {} : { client }),
  })
}
