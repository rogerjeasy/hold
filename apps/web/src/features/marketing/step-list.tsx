import { useTranslations } from 'next-intl'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

const stepKeys = ['reserve', 'handOver', 'return', 'settle'] as const

export function StepList() {
  const t = useTranslations('steps.items')
  const money = useExampleMoney()
  const { takenCents, releasedCents } = exampleRental.outcomes.damage
  const values = {
    amount: money(exampleRental.reservedCents),
    count: exampleRental.photographCount,
    taken: money(takenCents),
    released: money(releasedCents),
  }

  return (
    <ol role="list" className="grid sm:grid-cols-2 lg:grid-cols-4">
      {stepKeys.map((key, index) => (
        <li
          key={key}
          className="flex flex-col gap-2 border-t border-t-foreground pt-5 pb-8 sm:pr-6 sm:max-lg:even:border-l sm:max-lg:even:pl-6 lg:pb-0 lg:not-first:border-l lg:not-first:pl-6"
        >
          <span aria-hidden="true" className="label text-primary">
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className="text-2xl leading-tight font-bold tracking-tight">{t(`${key}.title`)}</h3>
          <p className="text-muted-foreground">{t(`${key}.body`)}</p>
          <span className="figures mt-auto self-start border border-border-strong bg-card px-2 py-1 text-sm">{t(`${key}.state`, values)}</span>
        </li>
      ))}
    </ol>
  )
}
