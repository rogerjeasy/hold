import * as z from 'zod'

// What the bare comparison asks the model to return. Positions are on the return photograph, in thousandths of
// its width and height, so they do not depend on the image's pixel size.

export const FINDING_KINDS = [
  'scratch',
  'dent',
  'crack',
  'chip',
  'tear',
  'stain',
  'soiling',
  'missing_part',
  'broken_part',
  'other',
] as const

const position = z.number().int()

export const findingSchema = z.object({
  kind: z.enum(FINDING_KINDS),
  // Where on the item, in words a person at the counter would use.
  where: z.string(),
  box: z.object({ left: position, top: position, right: position, bottom: position }),
  confidence: z.enum(['low', 'medium', 'high']),
  description: z.string(),
})

export const comparisonSchema = z.object({
  sameItem: z.boolean(),
  sameView: z.boolean(),
  findings: z.array(findingSchema),
  // Differences the model saw and set aside, such as light or angle. They show what it is learning to ignore.
  setAside: z.array(z.string()),
})

export type Comparison = z.infer<typeof comparisonSchema>
export type Finding = z.infer<typeof findingSchema>
