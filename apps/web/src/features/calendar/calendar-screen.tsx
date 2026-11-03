'use client'

import type { ShopCalendar } from '@hold/db'
import { cn } from 'cn'
import { Bike, CalendarRange, GanttChart, List } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SEGMENTED_TRACK, segmentClass } from '@/components/ui/segmented'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { CalendarList } from './calendar-list'
import { calendarModel, STANDING_COLORS, STANDINGS } from './calendar-model'
import type { Standing } from './calendar-model'
import { RentalScheduler } from './rental-scheduler'

type CalendarScreenProps = { shopName: string; clock: ShopClock; window: { readonly from: Date; readonly to: Date }; calendar: ShopCalendar }
type View = 'timeline' | 'list'

// The two ways to read the calendar from a tablet up. A phone always reads the list.
function ViewSwitch({ view, onView }: { view: View; onView: (view: View) => void }) {
  const t = useTranslations('shop.calendar.view')
  const options = [['timeline', GanttChart], ['list', List]] as const
  return (
    <div role="group" aria-label={t('label')} className={cn(SEGMENTED_TRACK, 'max-md:hidden')}>
      {options.map(([each, Icon]) => (
        <button
          key={each}
          type="button"
          aria-pressed={view === each}
          onClick={() => { onView(each) }}
          className={segmentClass(view === each)}
        >
          <Icon aria-hidden="true" className="size-4" />
          {t(each)}
        </button>
      ))}
    </div>
  )
}

// The shop's calendar (extensions.md section 12.5). On a laptop, Bryntum Scheduler draws each item as a row and each
// rental as a bar marked by where its PayPal hold stands; on a phone, and on request, the same rentals are listed by
// item.
export function CalendarScreen({ shopName, clock, window, calendar }: CalendarScreenProps) {
  const t = useTranslations('shop.calendar')
  const format = useShopFormat(clock)
  const [view, setView] = useState<View>('timeline')
  const model = useMemo(() => calendarModel(calendar, t('unknownRenter')), [calendar, t])
  // Kept the same object between renders: the scheduler is built from it, and a new one would rebuild it.
  const standingText: Readonly<Record<Standing, string>> = useMemo(() => ({ held: t('standings.held'), awaiting: t('standings.awaiting'), late: t('standings.late'), settling: t('standings.settling'), done: t('standings.done') }), [t])
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      {model.resources.length === 0 ? (
        <div className="surface max-w-2xl">
          <EmptyState
            icon={Bike}
            title={t('noItemsTitle')}
            body={t('noItemsBody')}
            action={<Link href={shopRoutes.items} className={buttonVariants()}>{t('noItemsAction')}</Link>}
          />
        </div>
      ) : (
        <section aria-label={t('title')} className="surface min-w-0 overflow-clip">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border/70 px-4 py-3 md:px-5">
            <p className="figures flex items-center gap-2 text-sm font-medium">
              <CalendarRange aria-hidden="true" className="size-4 text-primary" />
              {t('range', { from: format.day(window.from), to: format.day(window.to) })}
            </p>
            <ViewSwitch view={view} onView={setView} />
          </div>
          <ul aria-label={t('legend')} className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[0.8125rem] font-medium md:px-5">
            {STANDINGS.map((standing) => (
              <li key={standing} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: STANDING_COLORS[standing] }} />
                {standingText[standing]}
              </li>
            ))}
          </ul>
          {model.events.length === 0 ? <p className="px-4 py-3 text-muted-foreground md:px-5">{t('empty')}</p> : null}
          <div className={cn('min-w-0', view === 'timeline' ? 'hidden md:block' : 'hidden')}>
            <RentalScheduler resources={model.resources} events={model.events} window={window} itemColumn={t('item')} rentalsRow={t('rentalsRow')} barLabel={(event) => `${event.name}, ${standingText[event.standing]}, ${format.day(new Date(event.startDate))} – ${format.day(new Date(event.endDate))}`} standingText={standingText} loading={t('loading')} failed={t('loadFailed')} />
          </div>
          <CalendarList resources={model.resources} events={model.events} clock={clock} standingText={standingText} className={view === 'timeline' ? 'md:hidden' : undefined} />
        </section>
      )}
    </ShopFrame>
  )
}
