import type { ProposalKind, ProposalState } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

export type RecentDecision = {
  readonly id: string
  readonly kind: ProposalKind
  readonly state: ProposalState
  readonly decisionReason: string | null
  readonly postponedUntil: Date | null
}

const NOTED = ['superseded', 'executing', 'failed'] as const
const noted = (state: ProposalState): state is (typeof NOTED)[number] => NOTED.some((each) => each === state)

// Each state's tone repeats what its word says.
const TONES: Readonly<Record<ProposalState, StatusTone>> = {
  pending: 'attention',
  approved: 'success',
  rejected: 'neutral',
  expired: 'neutral',
  superseded: 'neutral',
  executing: 'progress',
  executed: 'success',
  failed: 'danger',
}

// What became of each entry decided in the last day, once it has left the queue: done, being carried out, failed,
// rejected with its reason, superseded because its records changed, or put off until a given time.
export function RecentDecisions({ recent, clock }: { recent: readonly RecentDecision[]; clock: ShopClock }) {
  const t = useTranslations('operations')
  const format = useShopFormat(clock)
  return (
    <section aria-labelledby="recent-decisions" className="grid min-w-0 gap-4">
      <h2 id="recent-decisions" className="text-[1.1875rem] font-extrabold tracking-tight">{t('recent.title')}</h2>
      {recent.length === 0 ? <p className="text-muted-foreground">{t('recent.none')}</p> : (
        <ul className="surface grid divide-y divide-border/70 overflow-clip">
          {recent.map((decision) => (
            <li key={decision.id} className="grid min-w-0 gap-1.5 px-4 py-3.5 md:px-5">
              {/* One line of text, "Rejected · Ask for a new hold", read the same by a screen reader; the state shows as a pill. */}
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 wrap-long-words">
                <StatusPill tone={TONES[decision.state]}>{t(`states.${decision.state}`)}</StatusPill>
                <span className="sr-only"> · </span>
                <span className="min-w-0 font-semibold">{t(`kinds.${decision.kind}.action`)}</span>
              </p>
              {decision.state === 'pending' && decision.postponedUntil !== null ? <p className="text-sm text-muted-foreground">{t('recent.postponedUntil', { when: `${format.day(decision.postponedUntil)} ${format.time(decision.postponedUntil)}` })}</p> : null}
              {noted(decision.state) ? <p className="text-sm text-muted-foreground">{t(`stateNotes.${decision.state}`)}</p> : null}
              {decision.decisionReason === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{t('recent.reasonGiven', { reason: decision.decisionReason })}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
