'use client'

import type { ShopCalendar } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'
import { calendarModel, STANDING_COLORS, STANDINGS } from './calendar-model'
import type { Standing } from './calendar-model'
import { RentalScheduler } from './rental-scheduler'

type CalendarScreenProps = { shopName: string; clock: ShopClock; window: { readonly from: Date; readonly to: Date }; calendar: ShopCalendar }

// The shop's calendar (extensions.md section 12.5). On a laptop, Bryntum Scheduler draws each item as a row and each
// rental as a bar marked by where its PayPal hold stands; on a phone, the same rentals are listed by item.
export function CalendarScreen({ shopName, clock, window, calendar }: CalendarScreenProps) {
  const t = useTranslations('shop.calendar')
  const format = useShopFormat(clock)
  const model = calendarModel(calendar, t('unknownRenter'))
  const standingText: Readonly<Record<Standing, string>> = { held: t('standings.held'), awaiting: t('standings.awaiting'), late: t('standings.late'), settling: t('standings.settling'), done: t('standings.done') }
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid min-w-0 gap-6">
        <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
        {model.resources.length === 0 ? (
          <div className="grid gap-3">
            <Notice title={t('noItemsTitle')} body={t('noItemsBody')} />
            <Link href={shopRoutes.items} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
              {t('noItemsAction')}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="figures text-sm text-muted-foreground">{t('range', { from: format.day(window.from), to: format.day(window.to) })}</p>
              <ul aria-label={t('legend')} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {STANDINGS.map((standing) => (
                  <li key={standing} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-3 shrink-0" style={{ backgroundColor: STANDING_COLORS[standing] }} />
                    {standingText[standing]}
                  </li>
                ))}
              </ul>
            </div>
            {model.events.length === 0 ? <p>{t('empty')}</p> : null}
            <div className="hidden min-w-0 md:block">
              <RentalScheduler resources={model.resources} events={model.events} window={window} itemColumn={t('item')} standingText={standingText} loading={t('loading')} failed={t('loadFailed')} />
            </div>
            <ul aria-label={t('list')} className="grid gap-5 md:hidden">
              {model.resources.map((item) => {
                const booked = model.events.filter((event) => event.resourceId === item.id)
                return booked.length === 0 ? null : (
                  <li key={item.id} className="grid gap-2">
                    <h2 className="font-semibold wrap-long-words">{item.name}</h2>
                    <ul className="grid gap-2">
                      {booked.map((event) => (
                        <li key={event.id}>
                          <Link href={rentalRoutes.rental(event.rentalId)} className="grid min-h-11 gap-0.5 border-l-4 bg-card px-3 py-2" style={{ borderLeftColor: event.eventColor }}>
                            <span className="flex flex-wrap items-center gap-2 font-semibold wrap-long-words">
                              {event.name}
                              {event.simulated ? <SampleTag /> : null}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {standingText[event.standing]} · {format.day(new Date(event.startDate))} – {format.day(new Date(event.endDate))}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </ShopFrame>
  )
}
