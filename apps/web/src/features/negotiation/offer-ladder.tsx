import type { NegotiationTranscript } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { cn } from 'cn'
import { useLocale, useTranslations } from 'next-intl'
import { useId, type CSSProperties } from 'react'

type Move = NegotiationTranscript['moves'][number]
type Position = CSSProperties & Record<'--at', string>

// The amount a move stands for: an offer its own total, an acceptance the other side's last offer.
function standingCents(moves: readonly Move[], index: number): number | null {
  const move = moves[index]
  if (move === undefined || move.kind === 'pass') return null
  if (move.kind === 'offer') return move.totalCents
  return moves.slice(0, index).findLast((each) => each.side !== move.side && each.kind === 'offer')?.totalCents ?? null
}

// Every move of a negotiation on one scale, from nothing to the claim, so the gap between the two sides is seen closing.
// The words come from the transcript's own wording; the scale is drawn for the eye and hidden from screen readers.
export function OfferLadder({ transcript, caption }: { transcript: NegotiationTranscript; caption: string }) {
  const t = useTranslations('negotiation')
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, transcript.currency), locale)
  const captionId = useId()
  const scale = Math.max(transcript.claimTotalCents, 1)
  const at = (cents: number): Position => ({ '--at': `${String((cents * 100) / scale)}%` })

  return (
    <figure aria-labelledby={captionId} className="surface min-w-0 p-5 text-card-foreground md:p-7">
      <figcaption id={captionId} className="label text-xs text-muted-foreground">{caption}</figcaption>
      <ol className="mt-5 grid gap-4">
        {transcript.moves.map((move, index) => {
          const cents = standingCents(transcript.moves, index)
          const shop = move.side === 'shop'
          return (
            <li key={move.sequence} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5">
              <p className="min-w-0 text-sm wrap-long-words">
                <span className={cn('font-semibold', shop ? 'text-foreground' : 'text-primary')}>{t(`transcript.side.${move.side}`)}</span>
                <span className="text-muted-foreground"> · {t(`ladder.${move.kind === 'offer' && move.actor === 'referee' ? 'opening' : move.kind}`)}</span>
              </p>
              <p className="figures text-right font-semibold">{cents === null ? '' : amount(cents)}</p>
              {/* Inset by the marker's radius, so a marker at either end stays inside the row. */}
              <div aria-hidden="true" className="relative col-span-2 mx-1.5 h-3">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-strong" />
                {cents === null ? null : (
                  <>
                    <span style={at(cents)} className={cn('absolute top-1/2 left-0 h-1 w-(--at) -translate-y-1/2 rounded-full', shop ? 'bg-foreground/25' : 'bg-primary/35')} />
                    <span style={at(cents)} className={cn('absolute top-1/2 left-(--at) size-3 -translate-1/2 rounded-full ring-2 ring-card', shop ? 'bg-foreground' : 'bg-primary')} />
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-6 border-t border-border/70 pt-5">
        {transcript.agreedCents !== null && (transcript.state === 'agreed' || transcript.state === 'settled') ? (
          <>
            <p className="text-2xl font-extrabold tracking-tight">{t('ladder.agreed', { amount: amount(transcript.agreedCents) })}</p>
            <p className="mt-1 text-muted-foreground">{t('ladder.agreedNote', { amount: amount(transcript.claimTotalCents) })}</p>
          </>
        ) : (
          <p className="font-semibold">{t(transcript.state === 'open' ? 'ladder.open' : 'ladder.escalated')}</p>
        )}
      </div>
    </figure>
  )
}
