'use client'

import type { EventModel, Scheduler, SchedulerConfig } from '@bryntum/scheduler'
import { useLocale } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { Standing } from './calendar-model'
import { loadBryntum } from './bryntum-loader'
import type { RentalSchedulerProps } from './rental-scheduler'

// Bryntum's own names for the languages Hold speaks.
const BRYNTUM_LOCALES: Readonly<Record<string, string>> = { en: 'En', de: 'De', es: 'Es', fr: 'FrFr' }

// Read only: a booking is made, moved or ended on its rental's page, where every rule is checked. Selecting a bar opens
// that page. Each bar says its standing in words, encoded, as Bryntum inserts it as HTML.
export function BryntumRentals({ resources, events, window: shown, itemColumn, standingText, loading, failed }: RentalSchedulerProps) {
  const locale = useLocale()
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    let live = true
    let scheduler: Scheduler | undefined
    loadBryntum().then(
      (bryntum) => {
        if (!live || container.current === null) return
        void bryntum.LocaleManager.applyLocale(BRYNTUM_LOCALES[locale] ?? 'En')
        const renderBar: SchedulerConfig['eventRenderer'] = ({ eventRecord }: { eventRecord: EventModel }) => {
          const standing = eventRecord.getData('standing') as Standing
          return bryntum.StringHelper.encodeHtml(`${eventRecord.name} · ${standingText[standing]}`)
        }
        scheduler = new bryntum.Scheduler({
          appendTo: container.current,
          resources: [...resources],
          events: [...events],
          startDate: shown.from,
          endDate: shown.to,
          // It opens on today, a line marking now, with the week behind it a scroll away.
          visibleDate: { date: new Date(), block: 'start' },
          viewPreset: 'weekAndDay',
          rowHeight: 48,
          barMargin: 8,
          readOnly: true,
          columns: [{ text: itemColumn, field: 'name', width: 180 }],
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
        setState('ready')
      },
      () => {
        if (live) setState('failed')
      },
    )
    return () => {
      live = false
      scheduler?.destroy()
    }
  }, [resources, events, shown, itemColumn, standingText, locale, router])
  return (
    <div className="relative h-full">
      {state === 'ready' ? null : <p role={state === 'failed' ? 'alert' : 'status'} className="p-4">{state === 'failed' ? failed : loading}</p>}
      <div ref={container} className="absolute inset-0" />
    </div>
  )
}
