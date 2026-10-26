import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EVALUATION_GROUPS } from '@hold/domain'
import type { EvaluationGroup } from '@hold/domain'
import { z } from 'zod'

// The evaluation set: one case is one pair, a handover photograph and a return photograph of the same view
// (extensions.md section 5.3). The labels live here, beside the photographs.

export const HALVES = ['tuning', 'gate'] as const
export type Half = (typeof HALVES)[number]

// The pair counts the first version aims for, per half.
export const SET_TARGETS: Readonly<Record<EvaluationGroup, number>> = { clean_easy: 30, clean_hard: 30, wear: 20, damage: 40, known_mark: 15, identity: 10 }

const fraction = z.number().min(0).max(1)
const regionSchema = z.strictObject({ x: fraction, y: fraction, width: fraction.positive(), height: fraction.positive() })
  .refine((region) => region.x + region.width <= 1 && region.y + region.height <= 1, 'A region stays inside the photograph.')

const CLEAN: readonly EvaluationGroup[] = ['clean_easy', 'clean_hard', 'wear']

const caseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  half: z.enum(HALVES),
  group: z.enum(EVALUATION_GROUPS),
  // Whether the photographs were taken as they are, or changed by the augmentation tool.
  origin: z.enum(['real', 'synthetic']),
  view: z.string().min(1),
  before: z.string().min(1),
  after: z.string().min(1),
  // Earlier evidence of the same item. A return photograph that repeats one of them must reach a person.
  earlier: z.array(z.string().min(1)).default([]),
  labels: z.array(z.strictObject({ kind: z.enum(['damage', 'missing']), region: regionSchema })),
  knownMarks: z.array(regionSchema),
  note: z.string().max(400).optional(),
})
  .refine((each) => each.group !== 'damage' || each.labels.length > 0, 'A damage pair labels its region.')
  .refine((each) => !CLEAN.includes(each.group) || each.labels.length === 0, 'A clean pair carries no damage label.')
  .refine((each) => each.group !== 'known_mark' || each.knownMarks.length > 0, 'A known-mark pair names its mark.')
  .refine((each) => [each.before, each.after, ...each.earlier].every((path) => path.startsWith(`${each.half}/`) && !path.includes('..')), 'Each half keeps its photographs in its own folder.')

export type EvaluationCase = z.infer<typeof caseSchema>

export const manifestSchema = z.strictObject({
  version: z.literal(1),
  itemType: z.string().min(1),
  wearPolicy: z.string().min(1),
  priceCodes: z.array(z.string().min(1)),
  cases: z.array(caseSchema),
}).refine((manifest) => new Set(manifest.cases.map((each) => each.id)).size === manifest.cases.length, 'Every case has its own id.')

export type LoadedHalf = { readonly half: Half; readonly itemType: string; readonly wearPolicy: string; readonly priceCodes: readonly string[]; readonly cases: readonly EvaluationCase[]; readonly dataSetVersion: string }

// Reads one half of the set and nothing of the other: tuning never opens a gate photograph. The fingerprint covers
// the half's cases and the bytes of every photograph they name.
export async function loadHalf(root: string, half: Half): Promise<LoadedHalf> {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')))
  const cases = manifest.cases.filter((each) => each.half === half)
  const fingerprint = createHash('sha256').update(JSON.stringify({ itemType: manifest.itemType, wearPolicy: manifest.wearPolicy, priceCodes: manifest.priceCodes, cases }))
  for (const path of cases.flatMap((each) => [each.before, each.after, ...each.earlier])) {
    let bytes: Buffer
    try {
      bytes = await readFile(join(root, path))
    } catch {
      throw new Error(`The manifest names ${path}, which is missing.`)
    }
    fingerprint.update(path).update(createHash('sha256').update(bytes).digest())
  }
  return { half, itemType: manifest.itemType, wearPolicy: manifest.wearPolicy, priceCodes: manifest.priceCodes, cases, dataSetVersion: fingerprint.digest('hex') }
}

export function groupCounts(cases: readonly Pick<EvaluationCase, 'group'>[]): Record<EvaluationGroup, number> {
  return Object.fromEntries(EVALUATION_GROUPS.map((group) => [group, cases.filter((each) => each.group === group).length])) as Record<EvaluationGroup, number>
}
