import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { RENTAL_FILTERS } from './rental-standing'
import type { RentalFilter as Filter } from './rental-standing'

// Links, not buttons: each filter is its own address. Each says how many rentals it holds. The bar scrolls inside
// itself on a narrow phone rather than pushing the page sideways.
export function RentalFilter({ show, counts }: { show: Filter; counts: Readonly<Record<Filter, number>> }) {
  const t = useTranslations('shop.rentals.filter')
  return (
    <nav aria-label={t('label')} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex w-max min-w-full gap-1 rounded-2xl border border-border/70 bg-muted/60 p-1 md:w-fit md:min-w-0">
        {RENTAL_FILTERS.map((filter) => {
          const current = filter === show
          return (
            <li key={filter}>
              <Link
                href={filter === 'all' ? shopRoutes.rentals : `${shopRoutes.rentals}?show=${filter}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 ease-swift',
                  current ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                )}
              >
                {t(filter)}
                {/* A glance for the eye; the list below says the same to a screen reader, and the link keeps its plain name. */}
                <span aria-hidden="true" className={cn('figures rounded-md px-1.5 py-0.5 text-xs', current ? 'bg-primary/10 text-primary' : 'bg-foreground/6')}>{counts[filter]}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
