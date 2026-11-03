'use client'

import { BryntumRentals } from './bryntum-rentals'
import type { CalendarEvent, CalendarResource, Standing } from './calendar-model'

export type RentalSchedulerProps = {
  resources: readonly CalendarResource[]
  events: readonly CalendarEvent[]
  window: { readonly from: Date; readonly to: Date }
  itemColumn: string
  // What a screen reader calls the row of rental bars.
  rentalsRow: string
  // What a screen reader hears for one bar: who rents it, where its hold stands and its dates.
  barLabel: (event: CalendarEvent) => string
  standingText: Readonly<Record<Standing, string>>
  loading: string
  failed: string
}

// Bryntum Scheduler draws in the browser only, from its own build, which loads once the page is in the browser. It
// fills a frame as tall as the screen allows, so the page around it stays still while it scrolls inside.
export function RentalScheduler(props: RentalSchedulerProps) {
  return (
    <div className="h-[min(40rem,72dvh)] min-h-80 overflow-hidden bg-card">
      <BryntumRentals {...props} />
    </div>
  )
}
