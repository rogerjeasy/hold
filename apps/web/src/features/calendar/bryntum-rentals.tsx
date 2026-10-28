'use client'

import { LocaleManager, StringHelper } from '@bryntum/scheduler'
import type { EventModel, SchedulerConfig } from '@bryntum/scheduler'
import { BryntumScheduler } from '@bryntum/scheduler-react'
import '@bryntum/scheduler/locales/scheduler.locale.De.js'
import '@bryntum/scheduler/locales/scheduler.locale.Es.js'
import '@bryntum/scheduler/locales/scheduler.locale.FrFr.js'
import '@bryntum/scheduler/scheduler.css'
import '@bryntum/scheduler/stockholm-light.css'
import '@bryntum/scheduler/fontawesome/css/fontawesome.css'
import '@bryntum/scheduler/fontawesome/css/solid.css'
import { useLocale } from 'next-intl'
import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import type { Standing } from './calendar-model'
import type { RentalSchedulerProps } from './rental-scheduler'

// Bryntum's own names for the languages Hold speaks.
const BRYNTUM_LOCALES: Readonly<Record<string, string>> = { en: 'En', de: 'De', es: 'Es', fr: 'FrFr' }

// Read only: a booking is made, moved or ended on its rental's page, where every rule is checked. Selecting a bar opens
// that page. Each bar says its standing in words, encoded, as Bryntum inserts it as HTML.
export function BryntumRentals({ resources, events, window, itemColumn, standingText }: RentalSchedulerProps) {
  const locale = useLocale()
  const router = useRouter()
  useEffect(() => {
    void LocaleManager.applyLocale(BRYNTUM_LOCALES[locale] ?? 'En')
  }, [locale])
  const renderBar: SchedulerConfig['eventRenderer'] = ({ eventRecord }: { eventRecord: EventModel }) => {
    const standing = eventRecord.getData('standing') as Standing
    return StringHelper.encodeHtml(`${eventRecord.name} · ${standingText[standing]}`)
  }
  return (
    <BryntumScheduler
      resources={[...resources]}
      events={[...events]}
      startDate={window.from}
      endDate={window.to}
      // It opens on today, a line marking now, with the week behind it a scroll away.
      visibleDate={{ date: new Date(), block: 'start' }}
      timeRangesFeature={{ showCurrentTimeLine: true }}
      viewPreset="weekAndDay"
      rowHeight={48}
      barMargin={8}
      readOnly
      columns={[{ text: itemColumn, field: 'name', width: 180 }]}
      weekStartDay={1}
      eventRenderer={renderBar}
      eventDragFeature={false}
      eventResizeFeature={false}
      eventEditFeature={false}
      eventMenuFeature={false}
      scheduleMenuFeature={false}
      cellMenuFeature={false}
      headerMenuFeature={false}
      eventTooltipFeature={false}
      onEventClick={({ eventRecord }) => {
        router.push(rentalRoutes.rental(String(eventRecord.getData('rentalId'))))
      }}
    />
  )
}
