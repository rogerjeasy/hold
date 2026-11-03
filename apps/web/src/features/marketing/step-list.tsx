import { useTranslations } from 'next-intl'
import { exampleRental } from './example-rental'
import { momentIcons, momentKeys } from './moment-icons'
import { useExampleMoney } from './use-example-money'

// The four moments as cards on one line. The list itself carries the order.
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
    <div className="relative isolate">
      {/* One dashed thread behind the cards on wide screens, level with their icons; it shows only between them. */}
      <span aria-hidden="true" className="absolute inset-x-8 top-11.5 -z-10 hidden border-t border-dashed border-border-strong lg:block" />
      <ol role="list" className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {momentKeys.map((key) => {
          const Icon = momentIcons[key]
          return (
            <li key={key} className="surface flex flex-col gap-3 p-5 md:p-6">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-2 text-2xl leading-tight font-bold tracking-tight wrap-long-words">{t(`${key}.title`)}</h3>
              <p className="text-muted-foreground">{t(`${key}.body`)}</p>
              <span className="figures mt-auto self-start rounded-full bg-muted px-3 py-1 text-sm wrap-long-words">{t(`${key}.state`, values)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
