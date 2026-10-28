'use client'

import dynamic from 'next/dynamic'
import type { CalendarEvent, CalendarResource, Standing } from './calendar-model'

export type RentalSchedulerProps = {
  resources: readonly CalendarResource[]
  events: readonly CalendarEvent[]
  window: { readonly from: Date; readonly to: Date }
  itemColumn: string
  standingText: Readonly<Record<Standing, string>>
  loading: string
}

// Bryntum Scheduler draws in the browser only, and its bundle is large, so it loads once the page is in the browser.
const BryntumRentals = dynamic(() => import('./bryntum-rentals').then((module) => module.BryntumRentals), { ssr: false })

export function RentalScheduler(props: RentalSchedulerProps) {
  return (
    <div className="h-[32rem] min-h-80 overflow-hidden border border-border-strong bg-card" aria-label={props.itemColumn}>
      <BryntumRentals {...props} />
    </div>
  )
}
