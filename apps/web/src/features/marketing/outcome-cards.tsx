import { CircleCheck, ScanSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { exampleRental, outcomeKeys } from './example-rental'
import { HoldCard } from './hold-card'
import { useExampleMoney } from './use-example-money'

const icons = { clean: CircleCheck, damage: ScanSearch } as const

// The two ways a rental ends, side by side: what happens to the hold, and what the renter is told.
export function OutcomeCards() {
  const t = useTranslations('pages.howItWorks.outcomes')
  const evidence = useTranslations('evidence')
  const money = useExampleMoney()
  const values = {
    amount: money(exampleRental.reservedCents),
    taken: money(exampleRental.outcomes.damage.takenCents),
    released: money(exampleRental.outcomes.damage.releasedCents),
  }

  return (
    <ul role="list" className="grid gap-4 md:grid-cols-2">
      {[...outcomeKeys].reverse().map((key) => {
        const Icon = icons[key]
        return (
          <li key={key} className="flex flex-col gap-5 border bg-card p-4 md:p-7">
            <p className="label flex items-center gap-2 text-muted-foreground">
              <Icon aria-hidden="true" className={key === 'clean' ? 'size-4.5 text-success' : 'size-4.5 text-primary'} />
              {evidence(key)}
            </p>
            <h4 className="text-title text-balance wrap-long-words">{t(`${key}.title`)}</h4>
            <HoldCard outcome={key} className="border-border bg-background" />
            <figure className="mt-auto border-l-2 border-l-foreground pl-4">
              <blockquote className="text-[1.0625rem]">{t(`${key}.message`, values)}</blockquote>
              <figcaption className="label mt-2 text-xs text-muted-foreground">{t('phone')}</figcaption>
            </figure>
          </li>
        )
      })}
    </ul>
  )
}
