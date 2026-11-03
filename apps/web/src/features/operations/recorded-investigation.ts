import { DETECTOR_KINDS, PROPOSAL_KINDS } from '@hold/domain'
import { z } from 'zod'
import file from './recorded-investigation.json'

// A live investigation of the demonstration's sample queue entries by the operations agent, recorded from Bedrock by
// packages/ops/scripts/record-sample-investigation.ts and committed, so the AI page can show what the agent writes to
// anyone, signed in or not. It is checked like any outside data before it is shown.

const recording = z.strictObject({
  recordedAt: z.coerce.date(),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  toolCalls: z.int().nonnegative(),
  tokens: z.int().nonnegative(),
  // Only PayPal's read tools are ever offered to the agent (packages/ops/src/paypal-reader.ts): each one gets or lists.
  tools: z.array(z.string().regex(/^paypal\.(get|list)_[a-z_]+$/)),
  entries: z.array(z.strictObject({
    kind: z.enum(PROPOSAL_KINDS),
    exceptionKind: z.enum(DETECTOR_KINDS),
    reason: z.string().min(1),
    references: z.array(z.string()),
    draft: z.string().nullable(),
  })).min(1),
})
const recordingFile = z.strictObject({ recording: recording.nullable() })

export type RecordedInvestigation = z.infer<typeof recording>

// The recording in a file's contents, or nothing when none was recorded or it does not read as one.
export function recordedInvestigation(contents: unknown): RecordedInvestigation | undefined {
  const parsed = recordingFile.safeParse(contents)
  return parsed.success ? (parsed.data.recording ?? undefined) : undefined
}

// The committed recording, if one has been made.
export const RECORDED_INVESTIGATION = recordedInvestigation(file)
