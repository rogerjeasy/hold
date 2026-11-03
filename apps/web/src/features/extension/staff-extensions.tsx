import type { RentalExtension } from '@hold/db'
import { CalendarPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const SHOWN = new Set(['paid', 'capturing', 'failed'])

// The days a renter added from their phone or assistant (architecture.md section 6.14), each with what was paid. They
// went through with nobody to ask, so staff see them here and on the calendar.
export function StaffExtensions({ extensions, clock }: { extensions: readonly RentalExtension[]; clock: ShopClock }) {
  const t = useTranslations('extension.staff')
  const format = useShopFormat(clock)
  const shown = extensions.filter((each) => SHOWN.has(each.state))
  if (shown.length === 0) return null
  return (
    <Panel title={t('title')} icon={CalendarPlus}>
      <ul className="divide-y divide-border/70">
        {shown.map((extension) => (
          <li key={extension.id} className="grid gap-0.5 px-4 py-3.5 md:px-5">
            <span className="font-semibold wrap-long-words">{t('line', { days: extension.extraDays, when: `${format.day(extension.toEndsAt)}, ${format.time(extension.toEndsAt)}` })}</span>
            <span className="text-sm text-muted-foreground">{t(extension.state === 'paid' ? 'paid' : extension.state === 'failed' ? 'failed' : 'capturing', { amount: format.money(extension.amountCents) })} · {t(extension.askedThrough === 'assistant' ? 'byAssistant' : 'byLink')}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
