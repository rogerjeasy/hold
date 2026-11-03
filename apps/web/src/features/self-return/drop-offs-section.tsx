import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { DropOffCard } from './drop-off-card'
import type { DropOffEntry } from './drop-off-card'

// The morning's first job: items renters left at the drop point that nobody has checked yet, oldest first.
export function DropOffsSection({ dropOffs, clock, canAct }: { dropOffs: readonly DropOffEntry[]; clock: ShopClock; canAct: boolean }) {
  const t = useTranslations('selfReturn.staff')
  if (dropOffs.length === 0) return null
  return (
    <section aria-labelledby="drop-offs" className="grid gap-5">
      <div className="grid gap-1.5">
        <h2 id="drop-offs" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{t('sectionTitle', { count: dropOffs.length })}</h2>
        <p className="max-w-prose text-muted-foreground">{t('sectionLead')}</p>
      </div>
      {dropOffs.map((entry) => <DropOffCard key={entry.rentalId} entry={entry} clock={clock} canAct={canAct} />)}
    </section>
  )
}
