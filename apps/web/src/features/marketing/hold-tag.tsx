import { useTranslations } from 'next-intl'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

export function HoldTag() {
  const t = useTranslations('bothSides.hold')
  const money = useExampleMoney()
  const { takenCents, releasedCents } = exampleRental.outcomes.damage
  const rows = [
    { label: t('reserved'), cents: exampleRental.reservedCents },
    { label: t('taken'), cents: takenCents },
    { label: t('released'), cents: releasedCents },
  ]
  const title = t('title', { number: exampleRental.holdNumber })

  return (
    <div role="group" aria-label={title} className="relative border border-foreground bg-card px-3.5 py-2.5">
      <p className="mb-1 text-sm font-bold">{title}</p>
      <dl className="figures grid grid-cols-[auto_auto] gap-x-3.5 gap-y-0.5 text-[0.8125rem]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right font-medium">{money(row.cents, 'exact')}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
