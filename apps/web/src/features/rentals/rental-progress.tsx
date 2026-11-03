import type { RentalState } from '@hold/domain'
import { cn } from 'cn'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

const STEPS = ['booked', 'paid', 'hold', 'out', 'returned', 'settled'] as const

// How many of the steps a rental in this state has passed. A rental let go or cancelled stops where it was.
const REACHED: Readonly<Record<RentalState, number>> = {
  pending_payment: 1,
  abandoned: 1,
  booked: 2,
  awaiting_hold: 2,
  cancelled: 2,
  ready: 3,
  out: 4,
  overdue: 4,
  // Back at the drop point, but nobody at the shop has seen it yet.
  dropped_off: 4,
  returned: 5,
  inspecting: 5,
  settling: 5,
  closed: 6,
}

const STOPPED: ReadonlySet<RentalState> = new Set(['abandoned', 'cancelled'])

// The rental's life as a line of six steps: those passed filled, the one under way ringed, the rest dashed. Each says
// in words whether it is done, so the colour is never the only sign.
export function RentalProgress({ state }: { state: RentalState }) {
  const t = useTranslations('shop.rentals.detail')
  const titleId = useId()
  const reached = REACHED[state]
  const current = STOPPED.has(state) ? -1 : reached
  // The step named under the dots on a phone: the one under way, or the last passed when none is.
  const named = current >= 0 && current < STEPS.length ? current : reached - 1
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h2 id={titleId} className="label text-xs text-muted-foreground">{t('progress')}</h2>
      <ol className="mt-4 grid grid-cols-6">
        {STEPS.map((step, index) => {
          const done = index < reached
          const now = index === current
          return (
            <li key={step} aria-current={now ? 'step' : undefined} className="relative grid min-w-0 justify-items-center gap-2 px-0.5 text-center">
              {/* The line from the step before: filled once this step is reached. */}
              {index === 0 ? null : <span aria-hidden="true" className={cn('absolute top-3.5 right-1/2 left-[-50%] h-0.5 -translate-y-1/2 rounded-full', done ? 'bg-primary' : 'bg-border')} />}
              <span
                aria-hidden="true"
                className={cn(
                  'relative grid size-7 place-items-center rounded-full',
                  done ? 'bg-primary text-primary-foreground shadow-glow' : now ? 'border-2 border-primary bg-card text-primary' : 'border-2 border-dashed border-border-strong bg-card',
                )}
              >
                {done ? <Check className="size-3.5 stroke-3" /> : now ? <span className="size-2 animate-pulse-ring rounded-full bg-primary" /> : null}
              </span>
              {/* On a phone six names do not fit side by side: the dots stay, and one line under them names the step. */}
              <span className="grid min-w-0 gap-0.5 max-sm:sr-only">
                <span className={cn('text-sm leading-tight font-semibold wrap-long-words', !done && !now && 'text-muted-foreground')}>{t(`steps.${step}`)}</span>
                <span className="text-xs text-muted-foreground">{done ? t('done') : t('toDo')}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p aria-hidden="true" className="mt-3 text-center text-sm font-semibold sm:hidden">
        {t('stepOf', { number: named + 1, total: STEPS.length, step: t(`steps.${STEPS[named] ?? 'booked'}`) })}
      </p>
    </section>
  )
}
