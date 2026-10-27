import type { Ground, NegotiationSide } from '@hold/domain'
import type { AdvocateModel, AdvocateReply } from './advocate-model.ts'
import type { AdvocateBrief, RenterLimits, ShopLimits } from './brief.ts'

// The test environment's stand-in for Claude (extensions.md section 3, rule 9: simulated things say so). It never calls
// Bedrock and records its model as "simulated" on every move. It reads only the brief its side was sent, as the model
// does, and plays a plain strategy: concede the lines the evidence does not support, meet the other side halfway, and
// accept an offer inside its own limit.

export const SIMULATED_MODEL = 'simulated'

type BriefLine = AdvocateBrief['claim']['lines'][number]
type Offered = { readonly lineId: string; readonly cents: number; readonly ground: Ground | null; readonly evidence: readonly string[] }

function groundFor(line: BriefLine, brief: AdvocateBrief, side: NegotiationSide): { readonly ground: Ground; readonly evidence: readonly string[] } | null {
  if (line.evidence.knownMarkIds.length > 0) return { ground: 'known_mark', evidence: line.evidence.knownMarkIds.slice(0, 5) }
  if (line.evidence.inDoubt) return { ground: 'uncertain_evidence', evidence: [] }
  const clause = brief.wearPolicyClauses[0]
  if (!line.evidence.bothLooksConfirmed && clause !== undefined) return { ground: 'ordinary_wear', evidence: [clause.id] }
  if (side === 'shop' && 'goodwillAllowed' in brief.yourLimits && brief.yourLimits.goodwillAllowed) return { ground: 'goodwill', evidence: [] }
  return null
}

// Lines that reach a target total as nearly as the grounds allow: lines with no ground stay at their price, the others
// are filled in order up to theirs.
function linesFor(brief: AdvocateBrief, side: NegotiationSide, target: number): { readonly lines: readonly Offered[]; readonly totalCents: number } {
  const grounded = brief.claim.lines.map((line) => ({ line, ground: groundFor(line, brief, side) }))
  let left = Math.max(0, target - grounded.filter((each) => each.ground === null).reduce((sum, each) => sum + each.line.publishedCents, 0))
  const lines = grounded.map(({ line, ground }): Offered => {
    if (ground === null) return { lineId: line.lineId, cents: line.publishedCents, ground: null, evidence: [] }
    const cents = Math.min(line.publishedCents, left)
    left -= cents
    return cents < line.publishedCents ? { lineId: line.lineId, cents, ...ground } : { lineId: line.lineId, cents, ground: null, evidence: [] }
  })
  return { lines, totalCents: lines.reduce((sum, line) => sum + line.cents, 0) }
}

function choose(brief: AdvocateBrief): { readonly tool: 'offer' | 'accept' | 'pass'; readonly input: unknown } {
  const { yours, theirs } = brief.lastOffers
  const pass = { tool: 'pass' as const, input: {} }
  if (brief.you === 'renter') {
    const { highestTotalCents: highest } = brief.yourLimits as RenterLimits
    if (theirs !== null && theirs.totalCents <= highest) return { tool: 'accept', input: {} }
    if (brief.offersLeft.you <= 0) return pass
    const ceiling = Math.min(highest, theirs === null ? highest : theirs.totalCents - 1)
    const target = yours === null ? 0 : Math.min(ceiling, yours.totalCents + Math.ceil((ceiling - yours.totalCents) / 2))
    const offer = linesFor(brief, 'renter', target)
    if (offer.totalCents > ceiling || (yours !== null && offer.totalCents <= yours.totalCents && brief.kind === 'negotiation')) return pass
    return { tool: 'offer', input: { lines: offer.lines } }
  }
  const { lowestTotalCents: floor } = brief.yourLimits as ShopLimits
  if (theirs !== null && theirs.totalCents >= floor) return { tool: 'accept', input: {} }
  if (brief.offersLeft.you <= 0 || yours === null || theirs === null) return pass
  const target = Math.max(floor, theirs.totalCents + 1, yours.totalCents - Math.ceil((yours.totalCents - theirs.totalCents) / 2))
  const offer = linesFor(brief, 'shop', target)
  return offer.totalCents < yours.totalCents ? { tool: 'offer', input: { lines: offer.lines } } : pass
}

export function createScriptedAdvocate(): AdvocateModel {
  return {
    move(request) {
      const quoted = request.message.slice(request.message.indexOf('<negotiation>') + '<negotiation>'.length, request.message.indexOf('</negotiation>'))
      const chosen = choose(JSON.parse(quoted) as AdvocateBrief)
      const reply: AdvocateReply = { kind: 'move', ...chosen, model: SIMULATED_MODEL, inputTokens: 0, outputTokens: 0 }
      return Promise.resolve(reply)
    },
  }
}
