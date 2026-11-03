import type { CounterVisit } from '@hold/db'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CalendarCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'
import { cn } from 'cn'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { StatusPill } from '@/components/ui/status-pill'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const HELD = new Set(['placed', 'renewing', 'at_risk'])
// The time, a rail with each visit's dot, then the visit; where the panel is wide enough, the renter with the hold and
// the status have columns of their own. The panel's width decides, not the window's, since beside the holds it is
// narrower than the page.
const columns = 'grid-cols-[4.5rem_1.25rem_minmax(0,1fr)] @lg:grid-cols-[4.75rem_1.25rem_minmax(0,1fr)_minmax(0,1.25fr)_7rem]'

function HoldText({ visit, clock, day }: { visit: CounterVisit; clock: ShopClock; day: { start: Date; end: Date } }) {
  const t = useTranslations('today.counter.hold')
  const format = useShopFormat(clock)
  const { hold } = visit
  if (hold === null) return <>{t('none')}</>
  if (hold.state === 'requested') return <span className="font-medium text-warning">{t('requested')}</span>
  const amount = format.money(hold.reservedCents)
  if (!HELD.has(hold.state)) return <>{hold.state === 'released' ? t('released') : hold.state === 'captured' ? t('captured') : t('other', { amount })}</>
  // A return due today on a hold whose assured period also ends today: the time matters at the counter.
  const { assuredUntil } = hold
  if (!visit.done && assuredUntil !== null && assuredUntil >= day.start && assuredUntil < day.end) {
    return <span className="font-medium text-warning">{t('assuredUntil', { amount, time: format.time(assuredUntil) })}</span>
  }
  return <span className="figures">{t('held', { amount })}</span>
}

// The day's handovers and returns in the order they happen, on a rail with a line for now.
export function CounterList({ visits, now, day, clock }: { visits: readonly CounterVisit[]; now: Date; day: { start: Date; end: Date }; clock: ShopClock }) {
  const t = useTranslations('today.counter')
  const format = useShopFormat(clock)
  const nowIndex = visits.findIndex((visit) => visit.at > now)

  const nowLine = (
    <li aria-hidden="true" className={cn('relative grid items-center gap-x-3 px-4 py-1 md:px-5 @lg:px-5', columns)}>
      <span className="relative col-start-2 grid h-6 place-items-center">
        <span className="size-2.5 animate-pulse-ring rounded-full bg-primary text-primary ring-4 ring-card" />
      </span>
      <span className="col-start-3 flex min-w-0 items-center gap-2 @lg:col-end-[-1]">
        <span className="label shrink-0 rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] leading-normal whitespace-nowrap text-primary-foreground shadow-glow">{t('now', { time: format.time(now) })}</span>
        <span className="h-0.5 min-w-0 flex-1 rounded-full bg-linear-to-r from-primary to-primary/0" />
      </span>
    </li>
  )

  return (
    <Panel title={t('title')} icon={CalendarClock} aside={visits.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{visits.length}</span>}>
      {visits.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={t('empty')} body={t('emptyBody')} />
      ) : (
        <div className="@container">
          <div aria-hidden="true" className={cn('hidden gap-x-3 border-b border-border/70 bg-muted/40 px-5 py-2.5 text-[0.8125rem] font-semibold text-muted-foreground @lg:grid', columns)}>
            <span>{t('columns.time')}</span>
            <span />
            <span>{t('columns.visit')}</span>
            <span>{`${t('columns.renter')} · ${t('columns.hold')}`}</span>
            <span>{t('columns.status')}</span>
          </div>
          {/* The rail runs behind the dots, from the first visit to the last. */}
          <ol className="relative py-2 before:absolute before:top-6 before:bottom-6 before:left-[calc(6.875rem_-_1px)] before:w-0.5 before:rounded-full before:bg-border md:before:left-[calc(7.125rem_-_1px)] @lg:before:left-[calc(7.375rem_-_1px)]">
            {visits.map((visit, index) => {
              const Direction = visit.kind === 'handover' ? ArrowUpRight : ArrowDownLeft
              return (
                <Fragment key={`${visit.rentalId}-${visit.kind}`}>
                  {index === nowIndex ? nowLine : null}
                  <li className={cn('relative grid gap-x-3 gap-y-1 px-4 py-3 md:px-5 @lg:items-center @lg:px-5', columns, visit.done && 'text-muted-foreground')}>
                    <time dateTime={visit.at.toISOString()} className={cn('figures pt-1 text-sm whitespace-nowrap @lg:pt-0', !visit.done && 'font-semibold text-foreground')}>
                      {format.time(visit.at)}
                    </time>
                    <span aria-hidden="true" className="relative grid h-7 place-items-center self-start @lg:self-center">
                      <span className={cn('grid size-5 place-items-center rounded-full ring-4 ring-card', visit.done ? 'bg-success/15 text-success' : visit.kind === 'handover' ? 'bg-primary/12 text-primary' : 'bg-foreground/10 text-foreground')}>
                        <Direction className="size-3" />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">{t(visit.kind)}</p>
                      <p className="truncate text-[0.8125rem] text-muted-foreground">{visit.items.join(', ')}</p>
                    </div>
                    <div className="col-start-3 min-w-0 @lg:col-start-auto">
                      <p className="font-semibold text-foreground wrap-long-words">{visit.renterName ?? '—'}</p>
                      <p className="text-[0.8125rem]">
                        <HoldText visit={visit} clock={clock} day={day} />
                      </p>
                    </div>
                    <div className="col-start-3 flex flex-wrap items-center gap-1.5 pt-0.5 @lg:col-start-auto @lg:pt-0">
                      {visit.done ? <StatusPill tone="success">{t('done')}</StatusPill> : <StatusPill tone="neutral">{t('due')}</StatusPill>}
                      {visit.simulated ? <SampleTag /> : null}
                    </div>
                  </li>
                </Fragment>
              )
            })}
            {nowIndex === -1 ? nowLine : null}
          </ol>
        </div>
      )}
    </Panel>
  )
}
