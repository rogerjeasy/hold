import type { RenterIncident } from '@hold/db'

export type IncidentOutcome = 'photographs' | 'stored' | 'unsafe' | 'theft' | 'fault' | 'pricing' | 'offer' | 'agreed' | 'return' | 'resolved'

// Which fixed message a renter's report shows (extensions.md section 10.3). Anything that could bear on safety shows only
// its fixed message, before anything else is considered; Hold never says an item is safe to keep using.
export function outcomeOf(incident: Pick<RenterIncident, 'state' | 'kind' | 'sentAt' | 'offer'>): IncidentOutcome {
  if (incident.sentAt === null) return 'photographs'
  if (incident.kind === 'unsafe_or_unclear') return 'unsafe'
  if (incident.state === 'reported' || incident.kind === null) return 'stored'
  if (incident.kind === 'theft_or_loss') return 'theft'
  if (incident.kind === 'mechanical_fault') return 'fault'
  if (incident.state === 'resolved') return 'resolved'
  if (incident.state === 'agreed') return 'agreed'
  if (incident.state === 'triaged') return incident.offer === null ? 'pricing' : 'offer'
  return 'return'
}
