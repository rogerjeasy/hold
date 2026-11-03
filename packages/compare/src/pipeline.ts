import { checkRegion, INSPECTION_LIMITS, inspectFindings, unaccountedCandidates } from '@hold/domain'
import type { Region } from '@hold/domain'
import { mapRegion } from '@hold/vision/homography'
import type { PairResult } from '@hold/vision/inspect-pair'
import { pairedCrops } from './crops.ts'
import { lookSchema, PROMPT_VERSION } from './model.ts'
import type { ComparisonModel, ModelFinding } from './model.ts'

// The second look sees more of the item around the finding than the first look's crops, so it can tell what part it is.
// Measured on the demonstration's sample pair on 28 October 2026: at 0.03 it agreed on the class every time but was
// unsure of a featureless crop twice in five runs.
export const SECOND_LOOK_MARGIN = 0.1

// What a person reads on a candidate area the model neither reported nor dismissed.
export const UNACCOUNTED = 'Code found a difference here that the model neither reported nor dismissed. A person decides.'

type Mark = { readonly id: string; readonly view: string; readonly region: Region }
// reported: marks the renter reported during this rental (step 7), covered when agreed or made the shop's matter.
type Input = { readonly views: readonly { readonly view: string; readonly pair: PairResult }[]; readonly marks: readonly Mark[]; readonly reported?: readonly (Mark & { readonly covered: boolean })[]; readonly wearPolicy: string; readonly itemType: string; readonly priceCodes: readonly string[] }
type Observed = ModelFinding & { readonly view: string; readonly secondLookConfirmed: boolean | null }

// There are no action tools. Every call is independent, bounded, structured and revalidated here.
export async function compareInspection(input: Input, model: ComparisonModel) {
  const signal = AbortSignal.timeout(INSPECTION_LIMITS.maxMilliseconds)
  let calls = 0; let inputTokens = 0; let outputTokens = 0
  const models = new Set<string>()
  const findings: Observed[] = []
  const alignedMarks: Mark[] = []
  const alignedReported: (Mark & { covered: boolean })[] = []
  const alignment: Record<string, number> = {}
  let candidates = 0; let dismissed = 0; let unaccounted = 0
  // Bedrock throttled a look or could not answer it: not an answer from the model, and not a doubt about the photographs.
  let modelUnavailable = false
  const finish = (deferred: boolean) => {
    const inspected = inspectFindings(findings, alignedMarks, alignedReported)
    return { ...inspected, state: deferred ? 'deferred' as const : inspected.state, model: [...models].join(', ') || 'not_called', promptVersion: PROMPT_VERSION, modelUnavailable, alignment: { ...alignment, calls, inputTokens, outputTokens, candidates, dismissed, unaccounted } }
  }
  const look: ComparisonModel['look'] = async (request) => {
    if (calls >= INSPECTION_LIMITS.maxCalls || signal.aborted) return { kind: 'unavailable', model: 'not_called' }
    calls += 1
    const reply = await model.look(request, signal)
    // Only a result or a refusal is the model answering; the comparison is recorded in the name of those models alone.
    if (reply.kind === 'throttled' || reply.kind === 'unavailable') modelUnavailable = true
    else models.add(reply.model)
    if (reply.kind === 'result') { inputTokens += reply.inputTokens; outputTokens += reply.outputTokens }
    return reply
  }
  if (input.views.length === 0) return finish(true)
  for (const { view, pair } of input.views) {
    if (!pair.ok) return finish(true)
    alignment[view] = pair.alignment
    // Marks are drawn on the handover photograph; findings are in the return photograph's frame (see PreparedPair).
    const knownMarks = input.marks.filter((mark) => mark.view === view).map((mark) => ({ ...mark, region: mapRegion(pair.homography, mark.region) }))
    alignedMarks.push(...knownMarks)
    // Reported marks are matched by code alone and never shown to the model, which compares only the two photographs.
    alignedReported.push(...(input.reported ?? []).filter((mark) => mark.view === view).map((mark) => ({ ...mark, region: mapRegion(pair.homography, mark.region) })))
    const crops = (await Promise.all(pair.candidates.map((region) => pairedCrops(pair, region)))).flat()
    const first = await look({ kind: 'first', context: JSON.stringify({ itemType: input.itemType, wearPolicy: input.wearPolicy, priceCodes: input.priceCodes, knownMarks, candidateRegions: pair.candidates }), images: [{ label: 'Full handover photograph', body: pair.before }, { label: 'Full return photograph', body: pair.after }, ...crops] }, signal)
    if (first.kind !== 'result') return finish(true)
    const parsed = lookSchema.safeParse(first.data)
    if (!parsed.success || !parsed.data.sameItem || !parsed.data.sameView) return finish(true)
    for (const finding of parsed.data.findings) {
      if (!checkRegion(finding.region)) return finish(true)
      let secondLookConfirmed: boolean | null = null
      if (finding.class === 'new_damage' || finding.class === 'missing_part') {
        const second = await look({ kind: 'second', context: '', images: await pairedCrops(pair, finding.region, SECOND_LOOK_MARGIN) }, signal)
        const checked = second.kind === 'result' ? lookSchema.safeParse(second.data) : null
        secondLookConfirmed = checked?.success === true && checked.data.sameItem && checked.data.sameView && checked.data.findings.length > 0 && checked.data.findings.every((each) => each.class === finding.class && each.confidence >= INSPECTION_LIMITS.secondLookMinConfidence && checkRegion(each.region))
      }
      findings.push({ ...finding, view, priceCode: finding.priceCode !== null && input.priceCodes.includes(finding.priceCode) ? finding.priceCode : null, secondLookConfirmed })
    }
    // A candidate the model passed over in silence goes to a person, as an uncertain finding over it.
    const dismissedHere = parsed.data.dismissed.map((each) => each.candidate).filter((index) => index < pair.candidates.length)
    const left = unaccountedCandidates(pair.candidates, parsed.data.findings, dismissedHere)
    candidates += pair.candidates.length
    dismissed += new Set(dismissedHere).size
    unaccounted += left.length
    for (const region of left) findings.push({ region, class: 'uncertain', confidence: 0, description: UNACCOUNTED, priceCode: null, view, secondLookConfirmed: null })
  }
  return finish(false)
}
