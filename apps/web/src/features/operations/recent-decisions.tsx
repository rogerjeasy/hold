import type { ProposalKind, ProposalState } from '@hold/domain'
import { useTranslations } from 'next-intl'
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

// What became of each entry decided in the last day, once it has left the queue: done, being carried out, failed,
// rejected with its reason, superseded because its records changed, or put off until a given time.
export function RecentDecisions({ recent, clock }: { recent: readonly RecentDecision[]; clock: ShopClock }) {
  const t = useTranslations('operations')
  const format = useShopFormat(clock)
  return (
    <section aria-labelledby="recent-decisions" className="grid min-w-0 gap-3">
      <h2 id="recent-decisions" className="text-[1.1875rem] font-extrabold tracking-tight">{t('recent.title')}</h2>
      {recent.length === 0 ? <p className="text-muted-foreground">{t('recent.none')}</p> : (
        <ul className="grid divide-y border bg-card">
          {recent.map((decision) => (
            <li key={decision.id} className="grid min-w-0 gap-1 p-4">
              <p className="wrap-long-words"><span className="font-semibold">{t(`states.${decision.state}`)}</span> · {t(`kinds.${decision.kind}.action`)}</p>
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
