import { checkContestSummary, CONTEST_SUMMARY_LIMITS } from '@hold/domain'
import type { ContestRecord, StoredContestSummary } from '@hold/db'
import { CONTEST_PROMPT_VERSION, contestSummarySchema } from './contest-model.ts'
import type { ContestModel } from './contest-model.ts'

// Asks the model once, within the time ceiling, for a neutral summary of a contest (architecture.md section 6.15), and
// keeps it only once plain code has checked it: the strict schema, every line exactly once, the same lines disputed in
// both versions, no number anywhere, and quotes that are the renter's own words. Any other outcome is a normal one: the
// claim page still lays out both sides and the record's facts, by code.
export async function summarizeContest(record: ContestRecord, model: ContestModel, milliseconds: number = CONTEST_SUMMARY_LIMITS.maxMilliseconds): Promise<StoredContestSummary> {
  // No amount is sent: the model cannot repeat what it never reads.
  const quoted = JSON.stringify({
    readers: record.languages,
    claimLines: record.lines.map((line) => ({ lineId: line.id, what: line.description, basis: line.source, foundByComparison: line.findingDescription, bothLooksConfirmed: line.bothLooksConfirmed, markSeenBeforeNearby: line.knownMarkNearby, staffReason: line.source === 'finding' ? null : line.reason })),
    renterWords: record.comment,
    renterAddedPhotographs: record.renterPhotos > 0,
    conditionReportAtHandover: record.conditionReply ?? 'not_answered',
    renterReportedAnIncident: record.incidentsReported > 0,
  })
  const base = { promptVersion: CONTEST_PROMPT_VERSION, summary: null }
  let reply
  try {
    reply = await model.summarize({ quoted }, AbortSignal.timeout(milliseconds))
  } catch {
    return { ...base, outcome: 'unavailable', model: 'not_answered', simulated: false }
  }
  const simulated = reply.model === SIMULATED
  if (reply.kind !== 'result') return { ...base, outcome: reply.kind, model: reply.model, simulated }
  const parsed = contestSummarySchema.safeParse(reply.data)
  if (!parsed.success) return { ...base, outcome: 'invalid', model: reply.model, simulated }
  const checked = checkContestSummary(parsed.data, { lineIds: record.lines.map((line) => line.id), comment: record.comment })
  if (!checked.ok) return { ...base, outcome: checked.error, model: reply.model, simulated }
  return { promptVersion: CONTEST_PROMPT_VERSION, outcome: 'answered', summary: checked.value, model: reply.model, simulated }
}

const SIMULATED = 'simulated'

// The test environment's stand-in, which never calls Bedrock and says so in every record it leaves. It takes a line as
// disputed when the renter's words name it, and words each side with fixed sentences.
export function createSimulatedContestModel(): ContestModel {
  return {
    summarize(request) {
      const record = JSON.parse(request.quoted) as { readonly claimLines: readonly { readonly lineId: string; readonly what: string; readonly basis: string }[]; readonly renterWords: string }
      const said = record.renterWords.toLowerCase()
      const lines = record.claimLines.map((line) => {
        const disputed = line.what.toLowerCase().split(/\W+/).some((word) => word.length > 3 && said.includes(word))
        return { lineId: line.lineId, disputed, shopSays: line.basis === 'finding' ? 'The comparison of the photographs found this.' : 'A person at the shop added this with a written reason.', renterSays: disputed ? 'The renter disputes this line.' : null, renterQuote: null }
      })
      const version = (overview: string) => ({ overview, lines })
      return Promise.resolve({ kind: 'result', data: { forShop: version('The renter disputes the lines marked below, in the words quoted.'), forRenter: version('You dispute the lines marked below, in your words.') }, model: SIMULATED })
    },
  }
}
