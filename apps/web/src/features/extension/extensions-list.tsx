import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { PaidExtension } from '@/server/extension-page'

const ICONS = { paid: CircleCheck, capturing: LoaderCircle, failed: CircleAlert } as const

// Each extension the renter paid for, being paid, or that PayPal refused, the newest first, in words.
export function ExtensionsList({ extensions, timeZone, currency }: { extensions: readonly PaidExtension[]; timeZone: string; currency: string }) {
  const t = useTranslations('extension.list')
  const format = useShopFormat({ timeZone, currency })
  if (extensions.length === 0) return null
  return (
    <section aria-labelledby="extensions" className="grid gap-2">
      <h2 id="extensions" className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
      <ul className="grid gap-2">
        {extensions.map((extension) => {
          const Icon = ICONS[extension.state]
          return (
            <li key={extension.id} className="surface flex gap-3 px-4 py-3.5">
              <Icon aria-hidden="true" className={extension.state === 'failed' ? 'mt-0.5 size-4.5 shrink-0 text-destructive' : 'mt-0.5 size-4.5 shrink-0 text-success'} />
              <span className="min-w-0 wrap-long-words">{t(extension.state, { days: extension.extraDays, amount: format.money(extension.amountCents), when: `${format.date(extension.toEndsAt)}, ${format.time(extension.toEndsAt)}` })}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
