import type { RentalState } from '@hold/domain'
import { cn } from 'cn'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { RENTAL_STEPS, STEPS_REACHED } from '@/lib/rental-steps'

// Where the rental stands, from booking to settling, as a renter follows it. On a phone the steps are a bar with the
// one in hand named under it; from a tablet up each step is named on the line. A rental let go stops where it was.
export function RentalJourney({ state }: { state: RentalState }) {
  const t = useTranslations('renter.journey')
  const reached = STEPS_REACHED[state]
  const ended = state === 'abandoned' || state === 'cancelled'
  // The step in hand: the first one not yet passed, unless the rental is over.
  const current = ended || reached >= RENTAL_STEPS.length ? -1 : reached
  const stage = current === -1 ? undefined : RENTAL_STEPS[current]
  return (
    <div className="grid gap-3">
      <div aria-hidden="true" className="grid grid-cols-6 gap-1.5 sm:hidden">
        {RENTAL_STEPS.map((step, index) => (
          <span key={step} className={cn('h-1.5 rounded-full', index < reached ? 'bg-primary' : index === current ? 'animate-pulse-ring bg-primary/35 text-primary' : 'bg-muted')} />
        ))}
      </div>
      {stage === undefined ? null : (
        <p aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2 text-sm sm:hidden">
          <span className="label text-[0.6875rem] text-muted-foreground">{t('next')}</span>
          <span className="font-semibold">{t(`steps.${stage}`)}</span>
        </p>
      )}
      <ol aria-label={t('title')} className="max-sm:sr-only sm:grid sm:grid-cols-6">
        {RENTAL_STEPS.map((step, index) => {
          const done = index < reached
          const now = index === current
          return (
            <li key={step} className="relative grid min-w-0 justify-items-center gap-2 text-center">
              {index === 0 ? null : <span aria-hidden="true" className={cn('absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2', done || now ? 'bg-primary' : 'bg-border')} />}
              <span aria-hidden="true" className={cn('relative grid size-6 place-items-center rounded-full border-2 transition-colors', done ? 'border-primary bg-primary text-primary-foreground' : now ? 'animate-pulse-ring border-primary bg-card text-primary' : 'border-border bg-card')}>
                {done ? <Check className="size-3.5" strokeWidth={3} /> : now ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              <span className={cn('text-[0.8125rem] leading-tight wrap-long-words', done || now ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{t(`steps.${step}`)}</span>
              <span className="sr-only">{done ? t('done') : now ? t('now') : t('toDo')}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
