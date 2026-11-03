import type { NegotiationTranscript } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import type { Ground } from '@hold/domain'
import { MessagesSquare } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'

type Move = NegotiationTranscript['moves'][number]

// The transcript both people read (extensions.md section 9.7). Every word is Hold's: the moves carry only amounts,
// grounds and the ids of this rental's records, worded here. Neither side's limits are in what it is given.
export function TranscriptView({ transcript }: { transcript: NegotiationTranscript }) {
  const t = useTranslations('negotiation')
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, transcript.currency), locale)
  const state = transcript.state === 'agreed' || transcript.state === 'settled' ? t(`states.${transcript.state}`, { amount: amount(transcript.agreedCents ?? 0) }) : t(`states.${transcript.state}`)
  return (
    <Panel title={t('transcript.title')} icon={MessagesSquare}>
      <div className="grid gap-4 p-4 md:p-5">
        <p className="text-lg font-extrabold tracking-tight text-pretty">{state}</p>
        {transcript.endedReason === null ? null : <p>{t(`ended.${transcript.endedReason}`)}</p>}
        {transcript.sample && !transcript.simulated ? <Notice title={t('sample.liveTitle')} body={t('sample.liveBody')} /> : null}
        {transcript.simulated ? <Notice title={t('simulated')} body={t('transcript.noLimits')} /> : <p className="text-muted-foreground">{t('transcript.noLimits')}</p>}
        <ol className="grid gap-3">
          {transcript.moves.map((move) => <MoveItem key={move.sequence} move={move} transcript={transcript} amount={amount} />)}
        </ol>
        <p className="text-sm text-muted-foreground">{t(transcript.chainVerified ? 'transcript.chainVerified' : 'transcript.chainBroken')}</p>
      </div>
    </Panel>
  )
}

function MoveItem({ move, transcript, amount }: { move: Move; transcript: NegotiationTranscript; amount: (cents: number) => string }) {
  const t = useTranslations('negotiation')
  const summary = move.kind === 'offer' ? (move.actor === 'referee' ? t('transcript.opening', { amount: amount(move.totalCents ?? 0) }) : t('transcript.offer', { amount: amount(move.totalCents ?? 0) })) : move.kind === 'accept' ? t('transcript.accept') : t('transcript.pass')
  return (
    <li className={`grid min-w-0 gap-2 rounded-2xl border p-4 ${move.side === 'shop' ? 'border-border/70 bg-background/60 sm:mr-8' : 'border-primary/20 bg-primary/5 sm:ml-8'}`}>
      <p className="label text-[0.6875rem] text-muted-foreground">{t('transcript.move', { number: move.sequence })} · {move.actor === 'renter_assistant' ? t('transcript.side.renter_assistant') : t(`transcript.side.${move.side}`)}</p>
      <p className="font-semibold">{summary}</p>
      {move.kind === 'pass' && move.passReason !== null ? <p>{t(`transcript.passReasons.${move.passReason}`)}</p> : null}
      {move.lines.length === 0 ? null : (
        <ul className="grid gap-2">
          {move.lines.map((line) => {
            const published = transcript.lines.find((each) => each.lineId === line.lineId)
            const name = published?.description ?? ''
            return (
              <li key={line.lineId} className="grid min-w-0 gap-0.5">
                <span className="wrap-long-words">{published !== undefined && line.cents < published.publishedCents ? t('transcript.lineLowered', { line: name, amount: amount(line.cents), published: amount(published.publishedCents) }) : t('transcript.line', { line: name, amount: amount(line.cents) })}</span>
                {line.ground === null ? null : <span className="text-sm text-muted-foreground wrap-long-words">{groundText(t, line.ground, line.evidence, transcript)}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function groundText(t: ReturnType<typeof useTranslations<'negotiation'>>, ground: Ground, evidence: readonly string[], transcript: NegotiationTranscript): string {
  if (ground !== 'ordinary_wear') return t(`grounds.${ground}`)
  const clauses = evidence.map((id) => transcript.wearClauses.find((clause) => clause.id === id)?.text ?? id).join(' ')
  return t('grounds.ordinary_wear', { clause: clauses })
}
