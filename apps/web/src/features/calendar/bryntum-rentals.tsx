'use client'

import type { EventModel, Model, Scheduler, SchedulerConfig } from '@bryntum/scheduler'
import { useLocale } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { openingDate } from './calendar-model'
import type { Standing } from './calendar-model'
import { loadBryntum } from './bryntum-loader'
import type { RentalSchedulerProps } from './rental-scheduler'
import './calendar-theme.css'

// Bryntum's own names for the languages Hold speaks.
const BRYNTUM_LOCALES: Readonly<Record<string, string>> = { en: 'En', de: 'De', es: 'Es', fr: 'FrFr' }

// A row tall enough for a bar a finger can press: 64 less a margin of 9 above and below leaves a bar of at least 44
// pixels, and a day wide enough for a renter's name.
const TICK_SIZE = 132
const ROW_HEIGHT = 64
const BAR_MARGIN = 9

// While Bryntum loads: the shape of the calendar, a column of items and a few bars.
function SchedulerSkeleton() {
  return (
    <div aria-hidden="true" className="grid h-full grid-cols-[12.5rem_minmax(0,1fr)] gap-x-4 p-4">
      <div className="grid content-start gap-5 pt-12">
        {[0, 1, 2, 3, 4, 5].map((row) => <Skeleton key={row} className="h-5 w-3/4" />)}
      </div>
      <div className="grid content-start gap-5 pt-12">
        {['w-1/3 ml-[10%]', 'w-1/4 ml-[35%]', 'w-2/5 ml-[5%]', 'w-1/5 ml-[55%]', 'w-1/3 ml-[25%]', 'w-1/4 ml-[60%]'].map((bar) => <Skeleton key={bar} className={`h-5 rounded-lg ${bar}`} />)}
      </div>
    </div>
  )
}

// Read only: a booking is made, moved or ended on its rental's page, where every rule is checked. Selecting a bar opens
// that page. Each bar says who rents it and its standing in words, encoded, as Bryntum inserts it as HTML.
export function BryntumRentals({ resources, events, window: shown, itemColumn, standingText, loading, failed }: RentalSchedulerProps) {
  const locale = useLocale()
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    let live = true
    let scheduler: Scheduler | undefined
    const keys = new AbortController()
    loadBryntum().then(
      (bryntum) => {
        if (!live || container.current === null) return
        void bryntum.LocaleManager.applyLocale(BRYNTUM_LOCALES[locale] ?? 'En')
        const encode = (text: string) => bryntum.StringHelper.encodeHtml(text)
        const renderBar: SchedulerConfig['eventRenderer'] = ({ eventRecord }: { eventRecord: EventModel }) => {
          const standing = eventRecord.getData('standing') as Standing
          return `<span class="hold-bar"><span>${encode(eventRecord.name)}</span><span class="hold-bar-standing">${encode(standingText[standing])}</span></span>`
        }
        const renderItem = ({ record }: { record: Model }) =>
          `<span class="hold-item"><span class="hold-item-name">${encode(String(record.getData('name')))}</span><span class="hold-item-type">${encode(String(record.getData('type')))}</span></span>`
        scheduler = new bryntum.Scheduler({
          appendTo: container.current,
          resources: [...resources],
          events: [...events],
          startDate: shown.from,
          endDate: shown.to,
          // It opens where the earliest rental still out began, a line marking now, with the rest a scroll away.
          visibleDate: { date: openingDate(events, new Date(), shown.from), block: 'start' },
          viewPreset: 'weekAndDay',
          rowHeight: ROW_HEIGHT,
          barMargin: BAR_MARGIN,
          tickSize: TICK_SIZE,
          eventStyle: 'tonal',
          readOnly: true,
          ariaLabel: itemColumn,
          columns: [{ text: itemColumn, field: 'name', width: 200, htmlEncode: false, renderer: renderItem }],
          weekStartDay: 1,
          eventRenderer: renderBar,
          features: {
            timeRanges: { showCurrentTimeLine: true },
            eventDrag: false,
            eventResize: false,
            eventEdit: false,
            eventMenu: false,
            scheduleMenu: false,
            cellMenu: false,
            headerMenu: false,
            eventTooltip: false,
          },
          listeners: {
            eventClick: ({ eventRecord }: { eventRecord: EventModel }) => {
              router.push(rentalRoutes.rental(String(eventRecord.getData('rentalId'))))
            },
          },
        })
        // A bar reached with the arrow keys opens its rental with Enter or Space, as a click does. Bryntum keeps those
        // keys for its own editing, which is off here, so they are read from the bar itself.
        const drawn = scheduler
        container.current.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          const bar = event.target instanceof Element ? event.target.closest('.b-sch-event-wrap') : null
          const record = bar instanceof HTMLElement ? drawn.resolveEventRecord(bar) : null
          if (record === null) return
          event.preventDefault()
          router.push(rentalRoutes.rental(String(record.getData('rentalId'))))
        }, { capture: true, signal: keys.signal })
        setState('ready')
      },
      () => {
        if (live) setState('failed')
      },
    )
    return () => {
      live = false
      keys.abort()
      scheduler?.destroy()
    }
  }, [resources, events, shown, itemColumn, standingText, locale, router])
  return (
    <div className="hold-calendar relative h-full">
      {state === 'ready' ? null : (
        <div className="absolute inset-0 z-10 bg-card">
          <p role={state === 'failed' ? 'alert' : 'status'} className={state === 'failed' ? 'p-4 font-semibold text-destructive' : 'sr-only'}>{state === 'failed' ? failed : loading}</p>
          {state === 'loading' ? <SchedulerSkeleton /> : null}
        </div>
      )}
      <div ref={container} className="absolute inset-0" />
    </div>
  )
}
