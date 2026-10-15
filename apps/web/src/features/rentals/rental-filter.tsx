import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { RENTAL_FILTERS } from './rental-standing'
import type { RentalFilter as Filter } from './rental-standing'

// Links, not buttons: each filter is its own address.
export function RentalFilter({ show }: { show: Filter }) {
  const t = useTranslations('shop.rentals.filter')
  return (
    <nav aria-label={t('label')} className="-mx-1 flex flex-wrap gap-1">
      {RENTAL_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={filter === 'all' ? shopRoutes.rentals : `${shopRoutes.rentals}?show=${filter}`}
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
