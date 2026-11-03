import { useTranslations } from 'next-intl'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

// The one hold both phones read from, as a small receipt between them.
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
    <div role="group" aria-label={title} className="relative rounded-xl bg-card px-4 py-3 shadow-raised ring-1 ring-border">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
        {title}
      </p>
      <dl className="figures grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[0.8125rem]">
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
