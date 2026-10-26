import { INCIDENT_LIMITS } from '@hold/domain'
import type { IncidentHint, PriceCategory } from '@hold/domain'
import type { TriageAnswer } from '@hold/db'
import { INCIDENT_PROMPT_VERSION, incidentSortSchema } from './incident-model.ts'
import type { IncidentModel } from './incident-model.ts'

export type IncidentReport = {
  readonly hint: IncidentHint
  readonly description: string
  readonly itemType: string
  readonly language: string
  // The price list the renter agreed to, without amounts: the model never names one.
  readonly prices: readonly { readonly code: string; readonly description: string; readonly category: PriceCategory }[]
}

// Asks the model once, within the time ceiling, and checks its answer against the strict schema. Any other outcome is
// a normal one: the report is stored already, and code sends it to a person (extensions.md section 10, X5.8).
export async function triageIncident(report: IncidentReport, model: IncidentModel, milliseconds: number = INCIDENT_LIMITS.maxMilliseconds): Promise<TriageAnswer> {
  const quoted = JSON.stringify({ renterChoice: report.hint, renterDescription: report.description, itemType: report.itemType, language: report.language, priceList: report.prices })
  const base = { promptVersion: INCIDENT_PROMPT_VERSION }
  let reply
  try {
    reply = await model.sort({ quoted }, AbortSignal.timeout(milliseconds))
  } catch {
    return { ...base, outcome: 'unavailable', data: null, model: 'not_answered', simulated: false }
  }
  const simulated = reply.model === SIMULATED
  if (reply.kind !== 'result') return { ...base, outcome: reply.kind, data: null, model: reply.model, simulated }
  const parsed = incidentSortSchema.safeParse(reply.data)
  return parsed.success ? { ...base, outcome: 'answered', data: parsed.data, model: reply.model, simulated } : { ...base, outcome: 'invalid', data: null, model: reply.model, simulated }
}

const SIMULATED = 'simulated'

// The test environment's stand-in, which never calls Bedrock and says so in every record it leaves. It takes the
// renter's own choice as the kind, and the first price whose words appear in their description.
export function createSimulatedIncidentModel(): IncidentModel {
  const kinds = { damage: 'small_damage', fault: 'mechanical_fault', gone: 'theft_or_loss', unsafe: 'unsafe_or_unclear', not_sure: 'unsafe_or_unclear' } as const
  return {
    sort(request) {
      const report = JSON.parse(request.quoted) as { readonly renterChoice: keyof typeof kinds; readonly renterDescription: string; readonly priceList: IncidentReport['prices'] }
      const kind = kinds[report.renterChoice]
      const words = report.renterDescription.toLowerCase()
      const price = kind === 'small_damage' ? report.priceList.find((entry) => entry.description.toLowerCase().split(/\W+/).some((word) => word.length > 3 && words.includes(word))) : undefined
      return Promise.resolve({ kind: 'result', data: { kind, confidence: 0.95, priceCode: price?.code ?? null, confirmation: null }, model: SIMULATED })
    },
  }
}
