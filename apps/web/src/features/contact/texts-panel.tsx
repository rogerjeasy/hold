'use client'
import type { RentalText } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// Each text Hold sent the renter, newest first, and what AWS End User Messaging said became of it (architecture.md
// section 12.3), so staff know whether the renter got it. The number is masked; the words are never kept.
export function TextsPanel({ texts, clock }: { texts: readonly RentalText[]; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.texts')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('title')}>
      <ul>
        {texts.map((text) => (
          <li key={text.id} className="grid gap-0.5 border-b px-4 py-3 last:border-b-0 md:px-5">
            <span className="font-semibold">{t(`purposes.${text.purpose}` as Parameters<typeof t>[0])}</span>
            <span className="text-sm text-muted-foreground wrap-long-words">
              {t(`statuses.${text.status}` as Parameters<typeof t>[0])} · {format.when(text.statusAt ?? text.createdAt)} · {text.toPhone}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
