import type { ItemCatalog } from '@hold/db'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { Figure } from '@/components/ui/figure'

// The four numbers on top of the items page. Retired items are not counted: they are no longer rented.
export function ItemsSummary({ catalog }: { catalog: ItemCatalog }) {
  const t = useTranslations('shop.items.summary')
  const titleId = useId()
  const live = catalog.items.filter((item) => item.standing !== 'retired')
  const count = (...standings: readonly string[]) => live.filter((item) => standings.includes(item.standing)).length

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        {t('label')}
      </h2>
      <dl className="grid grid-cols-2 border bg-card text-card-foreground xl:grid-cols-4">
        <Figure label={t('total')} value={String(live.length)} note={t('totalNote', { types: catalog.types.length })} />
        <Figure label={t('available')} value={String(count('available'))} note={t('availableNote')} />
        <Figure label={t('out')} value={String(count('out', 'overdue'))} note={t('outNote', { overdue: count('overdue') })} urgent={count('overdue') > 0} />
        <Figure label={t('repair')} value={String(count('in_repair'))} note={t('repairNote')} />
      </dl>
    </section>
  )
}
