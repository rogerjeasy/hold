import { compareInspection, photoReused } from '@hold/compare'
import type { ComparisonModel, FingerprintedPhoto } from '@hold/compare'
import type { EvaluatedCase } from '@hold/domain'
import { inspectPair } from '@hold/vision/inspect-pair'
import type { EvaluationCase } from './manifest.ts'

export type CaseDependencies = {
  readonly read: (path: string) => Promise<Buffer>
  readonly fingerprint: (photo: Buffer) => Promise<FingerprintedPhoto>
  readonly model: ComparisonModel
  readonly now: () => number
}

export type CaseContext = { readonly itemType: string; readonly wearPolicy: string; readonly priceCodes: readonly string[] }

// One pair through the same steps a return takes in the shop: the reuse check, the measured pair, then the two looks.
// Nothing here knows the labels: they are compared only afterwards, by the measures.
export async function runCase(dependencies: CaseDependencies, evaluation: EvaluationCase, context: CaseContext): Promise<EvaluatedCase> {
  const started = dependencies.now()
  const [before, after, ...earlier] = await Promise.all([evaluation.before, evaluation.after, ...evaluation.earlier].map((path) => dependencies.read(path)))
  if (before === undefined || after === undefined) throw new Error(`Case ${evaluation.id} has no pair.`)
  const outcome = (state: EvaluatedCase['state'], findings: EvaluatedCase['findings'], inputTokens: number, outputTokens: number): EvaluatedCase => ({
    id: evaluation.id, group: evaluation.group, origin: evaluation.origin, labels: evaluation.labels, knownMarks: evaluation.knownMarks,
    state, findings, milliseconds: dependencies.now() - started, inputTokens, outputTokens,
  })
  const [returned, ...previous] = await Promise.all([after, before, ...earlier].map((photo) => dependencies.fingerprint(photo)))
  if (returned === undefined || photoReused(returned, previous)) return outcome('deferred', [], 0, 0)
  const marks = evaluation.knownMarks.map((region, index) => ({ id: `known-${String(index)}`, view: evaluation.view, region }))
  const result = await compareInspection({ views: [{ view: evaluation.view, pair: await inspectPair(before, after) }], marks, wearPolicy: context.wearPolicy, itemType: context.itemType, priceCodes: context.priceCodes }, dependencies.model)
  const findings = result.findings.map((finding) => ({ region: finding.region, class: finding.class, confidence: finding.confidence, secondLookConfirmed: finding.secondLookConfirmed }))
  return outcome(result.state, findings, result.alignment.inputTokens, result.alignment.outputTokens)
}
