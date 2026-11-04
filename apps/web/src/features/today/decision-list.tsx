import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { ArrowRight, ChevronRight, CircleCheck, Clock, ListChecks, Lock, MapPin, MessageSquareQuote, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { Decision } from './decisions'
import { useRowText } from '@/features/decisions/use-row-text'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'

// Each kind of decision has its sign and its tone; the pill beside the title says the kind in words as well.
const KINDS: Readonly<Record<Decision['kind'], { readonly icon: LucideIcon; readonly tone: StatusTone; readonly tile: string }>> = {
  dropped_off: { icon: MapPin, tone: 'attention', tile: 'bg-warning/12 text-warning' },
  claim: { icon: Scale, tone: 'progress', tile: 'bg-primary/10 text-primary' },
  hold_ending: { icon: Lock, tone: 'attention', tile: 'bg-warning/12 text-warning' },
  late: { icon: Clock, tone: 'danger', tile: 'bg-destructive/10 text-destructive' },
  contested: { icon: MessageSquareQuote, tone: 'danger', tile: 'bg-destructive/10 text-destructive' },
  board: { icon: ListChecks, tone: 'neutral', tile: 'bg-muted text-foreground' },
}

// A claim is decided on its claim page; an item dropped off, a hold near its end or a late rental, on the rental's own
// page; anything else on the decision board, with its evidence. The whole row is the link, named by its title, so it
// is a large target on a phone.
function placeOf(decision: Decision): string {
  switch (decision.kind) {
    case 'claim':
    case 'contested':
      return rentalRoutes.claim(decision.rentalId)
    case 'board':
      return decision.row.kind === 'escalated' && decision.row.rentalId !== null ? rentalRoutes.claim(decision.row.rentalId) : shopRoutes.decisions
    default:
      return rentalRoutes.rental(decision.rentalId)
  }
}

function Row({ decision, title, children }: { decision: Decision; title: string; children: ReactNode }) {
  const t = useTranslations('today.decisions.kinds')
  const board = useTranslations('decisions.groups')
  const { icon: Icon, tone, tile } = KINDS[decision.kind]
  const titleId = `decision-${decision.key}`
  return (
    <li className="px-2 py-1 md:px-3">
      <Link
        href={placeOf(decision)}
        aria-labelledby={titleId}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3.5 rounded-xl px-2.5 py-3.5 transition-colors duration-200 hover:bg-muted/60 focus-visible:bg-muted/60 md:px-3"
      >
        <span aria-hidden="true" className={`grid size-10 place-items-center rounded-xl transition-transform duration-300 ease-spring group-hover:scale-105 ${tile}`}>
          <Icon className="size-[1.125rem]" />
        </span>
        <div className="grid min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 id={titleId} className="min-w-0 leading-snug font-bold wrap-long-words">
              {title}
            </h3>
            <StatusPill tone={tone}>{decision.kind === 'board' ? board(decision.row.group) : t(decision.kind)}</StatusPill>
            {decision.simulated ? <SampleTag /> : null}
          </div>
          <div className="mt-1 text-[0.9375rem] text-muted-foreground">{children}</div>
        </div>
        <ChevronRight aria-hidden="true" className="mt-2.5 size-4.5 text-muted-foreground transition-transform duration-300 ease-spring group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    </li>
  )
}

// Everything that waits on a person, most urgent first. A renter's words are shown as a quotation and nothing more.
export function DecisionList({ decisions, clock }: { decisions: readonly Decision[]; clock: ShopClock }) {
  const t = useTranslations('today')
  const format = useShopFormat(clock)
  const text = useRowText(clock)
  const renter = (name: string | null) => name ?? t('renter')

  return (
    <Panel
      title={t('decisions.title')}
      icon={Scale}
      aside={
        <span className="flex flex-wrap items-center gap-x-3">
          {decisions.length === 0 ? null : <span className="figures grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{decisions.length}</span>}
          {/* The agent's proposals and renters' reports wait there too, with each one's evidence. */}
          <Link href={shopRoutes.decisions} className="group inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold underline-offset-4 hover:underline">
            {t('decisions.openBoard')}
            <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
          </Link>
        </span>
      }
    >
      {decisions.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t('decisions.empty')} body={t('decisions.emptyBody')} />
      ) : (
        <ul className="grid stagger py-1.5">
          {decisions.map((decision) => {
            switch (decision.kind) {
              case 'dropped_off':
                return (
                  <Row key={decision.key} decision={decision} title={t('decisions.dropped_off.title', { renter: renter(decision.renterName), when: format.when(decision.droppedOffAt) })}>
                    {t('decisions.dropped_off.body')}
                  </Row>
                )
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
                      <span aria-hidden="true" className="relative h-1.5 max-w-64 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-warning" style={{ width: `${String((decision.day / HOLD_VALIDITY_DAYS) * 100)}%` }} />
                      </span>
                      <span className="figures text-xs text-foreground">{t('decisions.hold_ending.meter', { day: decision.day, max: HOLD_VALIDITY_DAYS })}</span>
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
                      <figure className="mt-0.5">
                        <figcaption className="sr-only">{t('decisions.contested.quote')}</figcaption>
                        <blockquote className="rounded-lg border-l-2 border-border-strong bg-muted/50 py-1.5 pr-3 pl-3 italic wrap-long-words">“{decision.renterComment}”</blockquote>
                      </figure>
                    )}
                  </Row>
                )
              case 'board':
                return (
                  <Row key={decision.key} decision={decision} title={text.heading(decision.row)}>
                    <span className="wrap-long-words">{text.subject(decision.row)}</span>
                  </Row>
                )
            }
          })}
        </ul>
      )}
    </Panel>
  )
}
