import type { RentalSummary } from '@hold/db'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { RentalFilter } from './rental-filter'
import { RentalList } from './rental-list'
import { partOf } from './rental-standing'
import type { RentalFilter as Filter } from './rental-standing'

export type RentalsScreenProps = { shopName: string; clock: ShopClock; rentals: readonly RentalSummary[]; show: Filter; canBook: boolean; shopPageUrl: string }

function NewRentalLink() {
  const t = useTranslations('shop.rentals')
  return (
    <Link href={rentalRoutes.new} className={buttonVariants({ className: 'justify-self-start' })}>
      <Plus aria-hidden="true" />
      {t('new')}
    </Link>
  )
}

// Every booking, newest first, and the shop's own page where renters book themselves.
export function RentalsScreen({ shopName, clock, rentals, show, canBook, shopPageUrl }: RentalsScreenProps) {
  const t = useTranslations('shop.rentals')
  const shown = show === 'all' ? rentals : rentals.filter((rental) => partOf(rental) === show)
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
          {canBook ? <NewRentalLink /> : null}
        </div>
        <div className="grid min-w-0 gap-0.5 text-[0.9375rem]">
          <p className="text-muted-foreground">{t('shopPageNote')}</p>
          <a href={shopPageUrl} className="inline-flex min-h-11 min-w-0 items-center font-semibold break-all underline underline-offset-4">
            {shopPageUrl}
          </a>
        </div>
        {rentals.length === 0 ? (
          <div className="grid max-w-prose gap-4">
            <Notice title={t('empty.title')} body={t('empty.body')} />
            {canBook ? <NewRentalLink /> : null}
          </div>
        ) : (
          <>
            <RentalFilter show={show} />
            {shown.length === 0 ? <p className="text-muted-foreground">{t('filter.none')}</p> : <RentalList rentals={shown} clock={clock} />}
          </>
        )}
      </div>
    </ShopFrame>
  )
}
