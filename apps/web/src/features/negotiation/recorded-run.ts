import type { NegotiationTranscript } from '@hold/db'
import { ESCALATION_REASONS, GROUNDS, MOVE_KINDS, NEGOTIATION_KINDS, NEGOTIATION_SIDES, NEGOTIATION_STATES, PASS_REASONS } from '@hold/domain'
import { z } from 'zod'
import file from './recorded-run.json'

// A live run of the two advocates on the demonstration's sample claim, recorded from Bedrock by
// packages/negotiate/scripts/record-sample-run.ts and committed. A sample claim shows it when no live run is left
// today, so the advocates can be seen at work whoever asks. It is checked like any outside data before it is shown.

const cents = z.int().nonnegative()
const offerLine = z.strictObject({ lineId: z.string().min(1), cents, ground: z.enum(GROUNDS).nullable(), evidence: z.array(z.string()) })
const transcript = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(NEGOTIATION_KINDS),
  state: z.enum(NEGOTIATION_STATES),
  endedReason: z.enum(ESCALATION_REASONS).nullable(),
  currency: z.string().length(3),
  claimTotalCents: cents,
  agreedCents: cents.nullable(),
  deadline: z.coerce.date(),
  roundLimit: z.int().positive(),
  shopConfirmedAt: z.coerce.date().nullable(),
  renterConfirmedAt: z.coerce.date().nullable(),
  // A recording of the test environment's stand-ins is not a live run.
  simulated: z.literal(false),
  sample: z.boolean(),
  chainVerified: z.boolean(),
  lines: z.array(z.strictObject({ lineId: z.string().min(1), publishedCents: cents, description: z.string() })),
  wearClauses: z.array(z.strictObject({ id: z.string().min(1), text: z.string() })),
  moves: z.array(z.strictObject({ sequence: z.int().positive(), side: z.enum(NEGOTIATION_SIDES), kind: z.enum(MOVE_KINDS), lines: z.array(offerLine), totalCents: cents.nullable(), passReason: z.enum(PASS_REASONS).nullable(), actor: z.string().min(1), model: z.string().nullable(), createdAt: z.coerce.date(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/) })),
})
const recording = z.strictObject({ recordedAt: z.coerce.date(), model: z.string().min(1), promptVersion: z.string().min(1), calls: z.int().nonnegative(), tokens: z.int().nonnegative(), transcript })
const recordingFile = z.strictObject({ recording: recording.nullable() })

export type RecordedRun = Omit<z.infer<typeof recording>, 'transcript'> & { readonly transcript: NegotiationTranscript }

// The recording in a file's contents, or nothing when none was recorded or it does not read as one.
export function recordedRun(contents: unknown): RecordedRun | undefined {
  const parsed = recordingFile.safeParse(contents)
  return parsed.success ? (parsed.data.recording ?? undefined) : undefined
}

// The committed recording, if one has been made.
export const RECORDED_RUN = recordedRun(file)
