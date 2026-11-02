// What a comparison says about itself above its result. A comparison is marked simulated when its photographs are
// demonstration samples or its model was a stand-in. When the real model still answered, only the photographs were
// staged, and saying "simulated" would hide that the comparison itself ran.
export type ComparisonNotice = 'none' | 'demonstration_photographs' | 'simulated'

export function comparisonNotice(comparison: { readonly simulated: boolean; readonly modelAnswered: boolean }): ComparisonNotice {
  if (!comparison.simulated) return 'none'
  return comparison.modelAnswered ? 'demonstration_photographs' : 'simulated'
}
