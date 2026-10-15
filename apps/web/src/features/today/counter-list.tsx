import type { CounterVisit } from '@hold/db'
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const HELD = new Set(['placed', 'renewing', 'at_risk'])
// One grid for the column heads and the rows from lg, so they line up. Below lg each row stacks.
const columns = 'lg:grid lg:grid-cols-[5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_5.5rem] lg:items-center lg:gap-x-4'

function HoldText({ visit, clock, day }: { visit: CounterVisit; clock: ShopClock; day: { start: Date; end: Date } }) {
  const t = useTranslations('today.counter.hold')
  const format = useShopFormat(clock)
  const { hold } = visit
  if (hold === null) return <>{t('none')}</>
  if (hold.state === 'requested') return <span className="text-warning">{t('requested')}</span>
  const amount = format.money(hold.reservedCents)
  if (!HELD.has(hold.state)) return <>{hold.state === 'released' ? t('released') : hold.state === 'captured' ? t('captured') : t('other', { amount })}</>
  // A return due today on a hold whose assured period also ends today: the time matters at the counter.
  const { assuredUntil } = hold
  if (!visit.done && assuredUntil !== null && assuredUntil >= day.start && assuredUntil < day.end) {
    return <span className="text-warning">{t('assuredUntil', { amount, time: format.time(assuredUntil) })}</span>
  }
  return <>{t('held', { amount })}</>
}

// The day's handovers and returns in the order they happen, with a line for now.
export function CounterList({ visits, now, day, clock }: { visits: readonly CounterVisit[]; now: Date; day: { start: Date; end: Date }; clock: ShopClock }) {
  const t = useTranslations('today.counter')
  const format = useShopFormat(clock)
  const nowIndex = visits.findIndex((visit) => visit.at > now)

  const nowLine = (
    <li aria-hidden="true" className="relative h-0 border-t-2 border-primary">
      <span className="label absolute -top-2.5 left-3 bg-primary px-1.5 text-[0.625rem] leading-[1.125rem] text-primary-foreground md:left-4">{t('now', { time: format.time(now) })}</span>
    </li>
  )

  return (
    <Panel title={t('title')} aside={visits.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{visits.length}</span>}>
      {visits.length === 0 ? (
        <p className="px-4 py-6 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <>
          <div aria-hidden="true" className={`label hidden border-b px-5 py-2.5 text-[0.6875rem] text-muted-foreground ${columns}`}>
            <span>{t('columns.time')}</span>
            <span>{t('columns.visit')}</span>
            <span>{t('columns.renter')}</span>
            <span>{t('columns.hold')}</span>
            <span>{t('columns.status')}</span>
          </div>
          <ol>
            {visits.map((visit, index) => {
              const Direction = visit.kind === 'handover' ? ArrowUpRight : ArrowDownLeft
              return (
                <Fragment key={`${visit.rentalId}-${visit.kind}`}>
                  {index === nowIndex ? nowLine : null}
                  <li
                    className={`grid grid-cols-[4.75rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-4 py-3.5 last:border-b-0 md:px-5 ${columns} ${visit.done ? 'text-muted-foreground' : ''}`}
                  >
                    <time dateTime={visit.at.toISOString()} className="figures row-span-3 pt-0.5 text-sm lg:row-span-1 lg:pt-0">
                      {format.time(visit.at)}
                    </time>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <Direction aria-hidden="true" className="size-4 shrink-0" />
                        {t(visit.kind)}
                      </p>
                      <p className="truncate text-[0.8125rem] text-muted-foreground">{visit.items.join(', ')}</p>
                    </div>
                    <p className="col-start-2 min-w-0 font-semibold wrap-long-words lg:col-start-auto">{visit.renterName ?? '—'}</p>
                    <p className="col-start-2 min-w-0 text-[0.8125rem] lg:col-start-auto lg:text-sm">
                      <HoldText visit={visit} clock={clock} day={day} />
                    </p>
                    <div className="col-start-3 row-span-3 row-start-1 flex flex-col items-end gap-1.5 self-center lg:col-start-auto lg:row-span-1 lg:row-start-auto lg:items-start">
                      {visit.done ? (
                        <span className="inline-flex items-center gap-1 border border-border-strong px-2 py-0.5 text-xs font-semibold">
                          <Check aria-hidden="true" className="size-3.5" />
                          {t('done')}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-foreground">{t('due')}</span>
                      )}
                      {visit.simulated ? <SampleTag /> : null}
                    </div>
                  </li>
                </Fragment>
              )
            })}
            {nowIndex === -1 ? nowLine : null}
          </ol>
        </>
      )}
    </Panel>
  )
}
