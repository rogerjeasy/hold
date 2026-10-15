import type { RentalState } from '@hold/domain'
import { CircleCheck, CircleDashed } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'

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
  returned: 5,
  inspecting: 5,
  settling: 5,
  closed: 6,
}

export function RentalProgress({ state }: { state: RentalState }) {
  const t = useTranslations('shop.rentals.detail')
  const reached = REACHED[state]
  return (
    <Panel title={t('progress')}>
      <ol className="grid gap-px sm:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((step, index) => {
          const done = index < reached
          const Icon = done ? CircleCheck : CircleDashed
          return (
            <li key={step} className="flex min-w-0 items-start gap-2 px-4 py-3 md:px-5">
              <Icon aria-hidden="true" className={done ? 'mt-0.5 size-4.5 shrink-0 text-primary' : 'mt-0.5 size-4.5 shrink-0 text-muted-foreground'} />
              <span className="min-w-0">
                <span className="block font-semibold wrap-long-words">{t(`steps.${step}`)}</span>
                <span className="block text-[0.8125rem] text-muted-foreground">{done ? t('done') : t('toDo')}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
