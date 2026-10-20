import { checkRegion, INSPECTION_LIMITS, inspectFindings } from '@hold/domain'
import type { Region } from '@hold/domain'
import type { PairResult } from '@hold/vision/inspect-pair'
import { pairedCrops } from './crops.ts'
import { lookSchema, PROMPT_VERSION } from './model.ts'
import type { ComparisonModel, ModelFinding } from './model.ts'

type Input = { readonly views: readonly { readonly view: string; readonly pair: PairResult }[]; readonly marks: readonly { readonly id: string; readonly view: string; readonly region: Region }[]; readonly wearPolicy: string; readonly itemType: string; readonly priceCodes: readonly string[] }
type Observed = ModelFinding & { readonly view: string; readonly secondLookConfirmed: boolean | null }

// There are no action tools. Every call is independent, bounded, structured and revalidated here.
export async function compareInspection(input: Input, model: ComparisonModel) {
  const signal = AbortSignal.timeout(INSPECTION_LIMITS.maxMilliseconds)
  let calls = 0; let inputTokens = 0; let outputTokens = 0
  const models = new Set<string>()
  const findings: Observed[] = []
  const alignedMarks: { id: string; view: string; region: Region }[] = []
  const alignment: Record<string, number> = {}
  const finish = (deferred: boolean) => {
    const inspected = inspectFindings(findings, alignedMarks)
    return { ...inspected, state: deferred ? 'deferred' as const : inspected.state, model: [...models].join(', ') || 'not_called', promptVersion: PROMPT_VERSION, alignment: { ...alignment, calls, inputTokens, outputTokens } }
  }
  const look: ComparisonModel['look'] = async (request) => {
    if (calls >= INSPECTION_LIMITS.maxCalls || signal.aborted) return { kind: 'unavailable', model: 'not_called' }
    calls += 1
    const reply = await model.look(request, signal)
    models.add(reply.model)
    if (reply.kind === 'result') { inputTokens += reply.inputTokens; outputTokens += reply.outputTokens }
    return reply
  }
  if (input.views.length === 0) return finish(true)
  for (const { view, pair } of input.views) {
    if (!pair.ok) return finish(true)
    alignment[view] = pair.alignment
    const knownMarks = input.marks.filter((mark) => mark.view === view).map((mark) => ({ ...mark, region: { ...mark.region, x: mark.region.x + pair.offset.x, y: mark.region.y + pair.offset.y } }))
    alignedMarks.push(...knownMarks)
    const crops = (await Promise.all(pair.candidates.map((region) => pairedCrops(pair, region)))).flat()
    const first = await look({ kind: 'first', context: JSON.stringify({ itemType: input.itemType, wearPolicy: input.wearPolicy, priceCodes: input.priceCodes, knownMarks, candidateRegions: pair.candidates }), images: [{ label: 'Full handover photograph', body: pair.before }, { label: 'Full return photograph', body: pair.after }, ...crops] }, signal)
    if (first.kind !== 'result') return finish(true)
    const parsed = lookSchema.safeParse(first.data)
    if (!parsed.success || !parsed.data.sameItem || !parsed.data.sameView) return finish(true)
    for (const finding of parsed.data.findings) {
      if (!checkRegion(finding.region)) return finish(true)
      let secondLookConfirmed: boolean | null = null
      if (finding.class === 'new_damage' || finding.class === 'missing_part') {
        const second = await look({ kind: 'second', context: '', images: await pairedCrops(pair, finding.region) }, signal)
        const checked = second.kind === 'result' ? lookSchema.safeParse(second.data) : null
        secondLookConfirmed = checked?.success === true && checked.data.sameItem && checked.data.sameView && checked.data.findings.length > 0 && checked.data.findings.every((each) => each.class === finding.class && each.confidence >= INSPECTION_LIMITS.minConfidence && checkRegion(each.region))
      }
      findings.push({ ...finding, view, priceCode: finding.priceCode !== null && input.priceCodes.includes(finding.priceCode) ? finding.priceCode : null, secondLookConfirmed })
    }
  }
  return finish(false)
}
