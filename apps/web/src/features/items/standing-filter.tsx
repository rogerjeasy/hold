import { useTranslations } from 'next-intl'
import { SEGMENTED_TRACK, segmentClass } from '@/components/ui/segmented'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ITEM_FILTERS } from './standing'
import type { ItemFilter } from './standing'

// Links, not buttons: each filter is its own address, so it can be shared and survives a reload. Set as a segmented
// control that scrolls inside itself on a narrow phone rather than pushing the page.
export function StandingFilter({ show }: { show: ItemFilter }) {
  const t = useTranslations('shop.items.filter')
  return (
    <nav aria-label={t('label')} className="max-w-full min-w-0 overflow-x-auto">
      <div className={SEGMENTED_TRACK}>
        {ITEM_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === 'all' ? shopRoutes.items : `${shopRoutes.items}?show=${filter}`}
            aria-current={filter === show ? 'page' : undefined}
            className={segmentClass(filter === show)}
          >
            {t(filter)}
          </Link>
        ))}
      </div>
    </nav>
  )
}
