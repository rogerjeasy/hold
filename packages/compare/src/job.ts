import { beginComparison, completeComparison, inShop } from '@hold/db'
import type { Database, DatabaseRole, StoredInspection } from '@hold/db'
import type { EvidenceStore } from '@hold/evidence'
import { inspectPair } from '@hold/vision/inspect-pair'
import type { PairResult } from '@hold/vision/inspect-pair'
import { z } from 'zod'
import { PROMPT_VERSION } from './model.ts'
import type { ComparisonModel } from './model.ts'
import { compareInspection } from './pipeline.ts'
import { photoReused } from './reuse.ts'

export const comparisonMessageSchema = z.strictObject({ shopId: z.uuid(), comparisonId: z.uuid() })
export type ComparisonDependencies = { readonly database: Database; readonly role: DatabaseRole; readonly evidence: EvidenceStore; readonly model: ComparisonModel; readonly now: () => Date; readonly simulated?: boolean }

// No PayPal dependency or execution tool exists here. Completing inspection never approves or executes a charge.
export async function runComparison(dependencies: ComparisonDependencies, message: z.infer<typeof comparisonMessageSchema>): Promise<'completed' | 'nothing_to_do'> {
  const scope = { role: dependencies.role, shopId: message.shopId }
  const work = await inShop(dependencies.database, scope, (transaction) => beginComparison(transaction, message.comparisonId, dependencies.now()))
  if (work === undefined) return 'nothing_to_do'
  const simulated = dependencies.simulated === true || [...work.before, ...work.after].some((photo) => photo.quality?.['simulated'] === 1)
  const finish = (result: StoredInspection) => inShop(dependencies.database, scope, (transaction) => completeComparison(transaction, work.id, work.startedAt, result, dependencies.now()))
  const deferred = (reason: string): StoredInspection => ({ state: 'deferred', model: 'not_called', promptVersion: PROMPT_VERSION, alignment: {}, findings: [], reason, simulated })
  try {
    const reused = work.after.some((photo) => photoReused(photo, work.previous))
    if (reused) { await finish(deferred('reused_photo')); return 'completed' }
    const views: { view: string; pair: PairResult }[] = []
    for (const view of work.plan.filter((view) => view.required || work.before.some((photo) => photo.view === view.key) || work.after.some((photo) => photo.view === view.key))) {
      const before = work.before.find((photo) => photo.view === view.key)
      const after = work.after.find((photo) => photo.view === view.key)
      if (before === undefined || after === undefined) { await finish(deferred('missing_view')); return 'completed' }
      const originals = await Promise.all([dependencies.evidence.read(before.evidenceKey), dependencies.evidence.read(after.evidenceKey)])
      views.push({ view: view.key, pair: await inspectPair(originals[0], originals[1]) })
    }
    const result = await compareInspection({ views, marks: work.known, reported: work.reported, priceCodes: work.prices.map((entry) => entry.code), wearPolicy: work.wearPolicy, itemType: work.itemType }, dependencies.model)
    await finish({ ...result, reason: result.state === 'deferred' ? 'inspection_uncertain' : null, simulated, findings: result.findings.map(({ priceCode, ...finding }) => ({ ...finding, suggestedPriceEntryId: work.prices.find((entry) => entry.code === priceCode)?.id ?? null })) })
    return 'completed'
  } catch (error) {
    // Unexpected processing failures still leave a visible manual path; the queue records the failure too.
    await finish(deferred('processing_failed'))
    throw error
  }
}
