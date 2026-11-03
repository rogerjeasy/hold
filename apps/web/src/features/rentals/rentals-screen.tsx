import type { RentalSummary } from '@hold/db'
import { CalendarPlus, Globe, Plus, SearchX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { RentalFilter } from './rental-filter'
import { RentalList } from './rental-list'
import { partOf } from './rental-standing'
import type { RentalFilter as Filter } from './rental-standing'

export type RentalsScreenProps = { shopName: string; clock: ShopClock; rentals: readonly RentalSummary[]; show: Filter; canBook: boolean; shopPageUrl: string }

// From lg the shell's own bar offers a new rental beside the page, so the page's own shows only below it.
function NewRentalLink({ className }: { className?: string }) {
  const t = useTranslations('shop.rentals')
  return (
    <Link href={rentalRoutes.new} className={buttonVariants({ className })}>
      <Plus aria-hidden="true" />
      {t('new')}
    </Link>
  )
}

// Where renters book themselves: the shop's own page, as its address.
function ShopPageCard({ url }: { url: string }) {
  const t = useTranslations('shop.rentals')
  return (
    <div className="surface flex min-w-0 items-center gap-3.5 px-4 py-3 md:px-5">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Globe className="size-4" />
      </span>
      <div className="grid min-w-0 gap-0.5 text-[0.9375rem]">
        <p className="text-sm text-muted-foreground">{t('shopPageNote')}</p>
        <a href={url} className="inline-flex min-h-11 min-w-0 items-center font-semibold break-all underline decoration-border-strong underline-offset-4 hover:decoration-primary">
          {url}
        </a>
      </div>
    </div>
  )
}

// Every booking, newest first, and the shop's own page where renters book themselves.
export function RentalsScreen({ shopName, clock, rentals, show, canBook, shopPageUrl }: RentalsScreenProps) {
  const t = useTranslations('shop.rentals')
  const shown = show === 'all' ? rentals : rentals.filter((rental) => partOf(rental) === show)
  const count = (part: Exclude<Filter, 'all'>) => rentals.filter((rental) => partOf(rental) === part).length
  const counts: Record<Filter, number> = { all: rentals.length, waiting: count('waiting'), booked: count('booked'), out: count('out'), returned: count('returned'), done: count('done') }
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')} actions={canBook ? <NewRentalLink className="lg:hidden" /> : undefined}>
      <div className="grid gap-6">
        <ShopPageCard url={shopPageUrl} />
        {rentals.length === 0 ? (
          <div className="surface">
            <EmptyState icon={CalendarPlus} title={t('empty.title')} body={t('empty.body')} action={canBook ? <NewRentalLink /> : undefined} />
          </div>
        ) : (
          <>
            <RentalFilter show={show} counts={counts} />
            {shown.length === 0 ? (
              <div className="surface">
                <EmptyState icon={SearchX} title={t('filter.none')} body={t('filter.noneBody')} />
              </div>
            ) : (
              <RentalList rentals={shown} clock={clock} />
            )}
          </>
        )}
      </div>
    </ShopFrame>
  )
}
