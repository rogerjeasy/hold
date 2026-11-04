import { INSPECTION_LIMITS } from '@hold/domain'
import { z } from 'zod'
import type { ComparisonModel, LookReply } from './model.ts'

const SIMULATED = 'simulated'
const fraction = z.number().min(0).max(1)
const firstLookSchema = z.object({ candidateRegions: z.array(z.strictObject({ x: fraction, y: fraction, width: fraction, height: fraction })) })
// The second look is shown only two crops of one finding, so its region is the whole crop (model.ts SECOND_PROMPT).
const WHOLE_CROP = { x: 0, y: 0, width: 1, height: 1 }
// Its second look confirms the first, so the finding can be claimed on the demo; the words say no model made either.
const SIMULATED_FINDING = 'Simulated: code found a change in this area between the handover and return photographs. A stand-in, not a model, wrote this and its second look, so inspect the item before you charge for it.'

// It reads no photograph and spends no tokens, so a comparison it answers is never counted as a model having answered.
const answer = (data: unknown): LookReply => ({ kind: 'result', data, model: SIMULATED, inputTokens: 0, outputTokens: 0 })

// The test environment's stand-in for Claude, which never calls Bedrock and records every answer as simulated. It words
// each area code found as new damage over exactly that area, and finds nothing where code found nothing. It never adds
// an area of its own and never picks a price: staff choose the price list line when they turn a finding into a claim.
export function createSimulatedComparisonModel(): ComparisonModel {
  return {
    look(request) {
      if (request.kind === 'second') return Promise.resolve(answer({ sameItem: true, sameView: true, findings: [{ region: WHOLE_CROP, class: 'new_damage', confidence: INSPECTION_LIMITS.secondLookMinConfidence, description: SIMULATED_FINDING, priceCode: null }], dismissed: [] }))
      let context: unknown
      try {
        context = JSON.parse(request.context)
      } catch {
        return Promise.resolve({ kind: 'unavailable', model: SIMULATED })
      }
      const parsed = firstLookSchema.safeParse(context)
      if (!parsed.success) return Promise.resolve({ kind: 'unavailable', model: SIMULATED })
      const findings = parsed.data.candidateRegions.slice(0, INSPECTION_LIMITS.maxFindings).map((region) => ({ region, class: 'new_damage', confidence: INSPECTION_LIMITS.minConfidence, description: SIMULATED_FINDING, priceCode: null }))
      return Promise.resolve(answer({ sameItem: true, sameView: true, findings, dismissed: [] }))
    },
  }
}
