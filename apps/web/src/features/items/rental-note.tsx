import type { BindingRental } from '@hold/db'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The line under an item's standing: when its booking starts, or when it is due back.
export function RentalNote({ rental, clock }: { rental: BindingRental | undefined; clock: ShopClock }) {
  const t = useTranslations('shop.items.rentalNote')
  const format = useShopFormat(clock)
  if (rental === undefined) return null
  const when = (at: Date) => `${format.day(at)}, ${format.time(at)}`
  const text =
    rental.state === 'out'
      ? t('out', { when: when(rental.endsAt) })
      : rental.state === 'overdue'
        ? t('overdue', { when: when(rental.endsAt) })
        : rental.state === 'dropped_off' || rental.state === 'returned' || rental.state === 'inspecting'
          ? t('checking')
          : t('booked', { when: when(rental.startsAt) })
  return <p className="text-[0.8125rem] text-muted-foreground">{text}</p>
}
