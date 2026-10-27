import { createHash } from 'node:crypto'
import type { MoveKind, NegotiationSide, OfferLine, PassReason } from '@hold/domain'

// The transcript's chain (extensions.md section 9.7): each move's fingerprint covers the move and the fingerprint of the
// move before it, so the sequence can be neither reordered nor trimmed, and the evidence pack can check it.

export type TranscriptMove = {
  readonly sequence: number
  readonly side: NegotiationSide
  readonly kind: MoveKind
  readonly lines: readonly OfferLine[]
  readonly totalCents: number | null
  readonly passReason: PassReason | null
  readonly actor: string
  readonly createdAt: Date
}
export type ChainedMove = TranscriptMove & { readonly previousFingerprint: string | null; readonly fingerprint: string }

// Fixed order, arrays not objects, so the same move always gives the same text.
export function moveFingerprint(previous: string | null, move: TranscriptMove): string {
  const canonical = JSON.stringify([previous, move.sequence, move.side, move.kind, move.lines.map((line) => [line.lineId, line.cents, line.ground, [...line.evidence]]), move.totalCents, move.passReason, move.actor, move.createdAt.toISOString()])
  return createHash('sha256').update(canonical).digest('hex')
}

export function chainMoves(moves: readonly TranscriptMove[]): ChainedMove[] {
  const chained: ChainedMove[] = []
  for (const move of moves) {
    const previousFingerprint = chained.at(-1)?.fingerprint ?? null
    chained.push({ ...move, previousFingerprint, fingerprint: moveFingerprint(previousFingerprint, move) })
  }
  return chained
}

// Checks every link from the first move: numbered from one, each naming the one before, each fingerprint its own.
export function verifyTranscript(moves: readonly ChainedMove[]): { readonly ok: true } | { readonly ok: false; readonly sequence: number } {
  let previous: string | null = null
  for (const [index, move] of moves.entries()) {
    if (move.sequence !== index + 1 || move.previousFingerprint !== previous || move.fingerprint !== moveFingerprint(previous, move)) return { ok: false, sequence: move.sequence }
    previous = move.fingerprint
  }
  return { ok: true }
}
