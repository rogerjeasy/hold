'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { CalendarEvent, CalendarResource, Standing } from './calendar-model'

type CalendarListProps = { resources: readonly CalendarResource[]; events: readonly CalendarEvent[]; clock: ShopClock; standingText: Readonly<Record<Standing, string>>; className?: string }

// The same rentals as the scheduler, listed by item: the calendar on a phone, and on a wider screen for anyone who
// would rather tab through links than a timeline. Each rental is a link to its page, edged in its standing's colour.
export function CalendarList({ resources, events, clock, standingText, className }: CalendarListProps) {
  const t = useTranslations('shop.calendar')
  const format = useShopFormat(clock)
  return (
    <ul aria-label={t('list')} className={`stagger grid gap-6 p-4 md:p-5 ${className ?? ''}`}>
      {resources.map((item) => {
        const booked = events.filter((event) => event.resourceId === item.id)
        return booked.length === 0 ? null : (
          <li key={item.id} className="grid gap-2">
            <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-semibold wrap-long-words">
              {item.name}
              <span className="text-sm font-normal text-muted-foreground">{item.type}</span>
            </h2>
            <ul className="grid gap-2">
              {booked.map((event) => (
                <li key={event.id}>
                  <Link
                    href={rentalRoutes.rental(event.rentalId)}
                    className="lift grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-l-4 bg-card px-3.5 py-2.5 shadow-xs"
                    style={{ borderLeftColor: event.eventColor }}
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-semibold wrap-long-words">
                        {event.name}
                        {event.simulated ? <SampleTag /> : null}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {standingText[event.standing]} · <span className="figures">{format.day(new Date(event.startDate))} – {format.day(new Date(event.endDate))}</span>
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
