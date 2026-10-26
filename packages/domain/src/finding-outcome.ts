export const FINDING_VERDICTS = ['upheld', 'reduced', 'removed_by_staff', 'removed_after_contest'] as const
export type FindingVerdict = (typeof FINDING_VERDICTS)[number]

// How a person finally treated a finding the comparison raised. It is the label the field record counts.
export function verdictForFinding(input: { readonly line: { readonly amountCents: number; readonly publishedCents: number } | null; readonly contested: boolean; readonly waived: boolean }): FindingVerdict {
  if (input.line === null) return 'removed_by_staff'
  if (input.waived) return input.contested ? 'removed_after_contest' : 'removed_by_staff'
  return input.line.amountCents < input.line.publishedCents ? 'reduced' : 'upheld'
}
