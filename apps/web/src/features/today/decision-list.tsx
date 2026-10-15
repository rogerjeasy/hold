import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { CircleCheck, Clock, Lock, MessageSquareQuote, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { Decision } from './decisions'
import { Panel } from './panel'
import { SampleTag } from './sample-tag'
import type { ShopClock } from './use-shop-format'
import { useShopFormat } from './use-shop-format'

const icons: Record<Decision['kind'], LucideIcon> = { claim: Scale, hold_ending: Lock, late: Clock, contested: MessageSquareQuote }

function Row({ decision, title, children }: { decision: Decision; title: string; children: ReactNode }) {
  const Icon = icons[decision.kind]
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 border-b px-4 py-4 last:border-b-0 md:px-5">
      <span
        aria-hidden="true"
        className={decision.kind === 'claim' ? 'grid size-9 place-items-center border border-primary text-primary' : 'grid size-9 place-items-center border border-border-strong'}
      >
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-bold leading-snug wrap-long-words">{title}</h3>
          {decision.simulated ? <SampleTag /> : null}
        </div>
        <div className="mt-1 text-[0.9375rem] text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

// Everything that waits on a person, most urgent first. A renter's words are shown as a quotation and nothing more.
export function DecisionList({ decisions, clock }: { decisions: readonly Decision[]; clock: ShopClock }) {
  const t = useTranslations('today')
  const format = useShopFormat(clock)
  const renter = (name: string | null) => name ?? t('renter')

  return (
    <Panel title={t('decisions.title')} aside={decisions.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{decisions.length}</span>}>
      {decisions.length === 0 ? (
        <div className="flex gap-3 px-4 py-6 md:px-5">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-semibold">{t('decisions.empty')}</p>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t('decisions.emptyBody')}</p>
          </div>
        </div>
      ) : (
        <ul>
          {decisions.map((decision) => {
            switch (decision.kind) {
              case 'claim':
                return (
                  <Row key={decision.key} decision={decision} title={t('decisions.claim.title', { amount: format.money(decision.totalCents), renter: renter(decision.renterName) })}>
                    {decision.firstLine === null ? t('decisions.claim.bodyNoLine') : t('decisions.claim.body', { line: decision.firstLine })}
                  </Row>
                )
              case 'hold_ending':
                return (
                  <Row key={decision.key} decision={decision} title={t('decisions.hold_ending.title', { renter: renter(decision.renterName), when: format.when(decision.validUntil) })}>
                    <p>{t('decisions.hold_ending.body')}</p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <span aria-hidden="true" className="relative h-1.5 max-w-64 flex-1 bg-muted">
                        <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${String((decision.day / HOLD_VALIDITY_DAYS) * 100)}%` }} />
                      </span>
                      <span className="figures text-xs">{t('decisions.hold_ending.meter', { day: decision.day, max: HOLD_VALIDITY_DAYS })}</span>
                    </div>
                  </Row>
                )
              case 'late':
                return (
                  <Row key={decision.key} decision={decision} title={t('decisions.late.title', { renter: renter(decision.renterName) })}>
                    {t('decisions.late.body', { when: format.when(decision.endsAt) })}
                  </Row>
                )
              case 'contested':
                return (
                  <Row key={decision.key} decision={decision} title={t('decisions.contested.title', { renter: renter(decision.renterName), amount: format.money(decision.totalCents) })}>
                    {decision.renterComment === null ? null : (
                      <figure>
                        <figcaption className="sr-only">{t('decisions.contested.quote')}</figcaption>
                        <blockquote className="border-l-2 border-border-strong pl-3 italic wrap-long-words">“{decision.renterComment}”</blockquote>
                      </figure>
                    )}
                  </Row>
                )
            }
          })}
        </ul>
      )}
    </Panel>
  )
}
