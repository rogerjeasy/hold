import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ITEM_FILTERS } from './standing'
import type { ItemFilter } from './standing'

// Links, not buttons: each filter is its own address, so it can be shared and survives a reload.
export function StandingFilter({ show }: { show: ItemFilter }) {
  const t = useTranslations('shop.items.filter')
  return (
    <nav aria-label={t('label')} className="-mx-1 flex flex-wrap gap-1">
      {ITEM_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={filter === 'all' ? shopRoutes.items : `${shopRoutes.items}?show=${filter}`}
          aria-current={filter === show ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center border px-3.5 text-sm font-semibold',
            filter === show ? 'border-foreground bg-foreground text-background' : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
          )}
        >
          {t(filter)}
        </Link>
      ))}
    </nav>
  )
}
