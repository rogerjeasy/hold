import type { QueueEntry } from '@hold/db'

export type EntryMark = 'raisedByAgent' | 'sampleNotInvestigated' | 'sampleInvestigated' | 'notInvestigated' | 'paypalNotChecked' | 'draftDropped'

// What an entry on the morning queue says about how it was written, wherever it is shown: the queue and the decision
// board. A sample's PayPal references were never on PayPal, so it is said to be a sample no model looked at yet, or
// the model that investigated it with PayPal's facts simulated, never that the agent or PayPal failed
// (extensions.md section 6.14).
export function entryMarks(entry: Pick<QueueEntry, 'raisedByAgent' | 'payload' | 'model'>): EntryMark[] {
  const { payload } = entry
  const sample = payload['simulated'] === 'yes'
  const marks: EntryMark[] = []
  if (entry.raisedByAgent) marks.push('raisedByAgent')
  if (sample && payload['investigated'] === 'no') marks.push('sampleNotInvestigated')
  if (sample && payload['investigated'] === 'yes' && entry.model !== null) marks.push('sampleInvestigated')
  if (!sample && payload['investigated'] === 'no') marks.push('notInvestigated')
  if (!sample && payload['paypalChecked'] === 'no') marks.push('paypalNotChecked')
  if (payload['draftDropped'] === 'yes') marks.push('draftDropped')
  return marks
}
