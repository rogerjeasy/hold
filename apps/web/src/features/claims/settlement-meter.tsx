import type { ClaimWorkspace } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { cn } from 'cn'
import { Scale } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'

const share = (part: number, whole: number) => (whole <= 0 ? 0 : Math.min(100, Math.max(0, (part / whole) * 100)))

// The hold and where it goes: a bar split into what is charged from it and what goes back to the renter, with each part
// named and given as a figure beside its swatch, so the bar is never the only way to read it. A separate invoice, when
// the hold could not cover the claim, is named on its own.
export function SettlementMeter({ data }: { data: ClaimWorkspace }) {
  const t = useTranslations('claim')
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, data.currency), locale)
  const parts: readonly { readonly key: 'capture' | 'release' | 'invoice'; readonly cents: number; readonly swatch: string }[] = [
    { key: 'capture', cents: data.amounts.capture.cents, swatch: 'bg-primary' },
    { key: 'release', cents: data.amounts.release.cents, swatch: 'bg-success' },
    ...(data.amounts.invoice.cents > 0 ? [{ key: 'invoice' as const, cents: data.amounts.invoice.cents, swatch: 'bg-warning' }] : []),
  ]
  return (
    <Panel title={t('summary')} icon={Scale}>
      <div className="grid gap-5 px-4 py-5 md:px-5">
        <dl className="min-w-0">
          <dt className="text-sm text-muted-foreground">{t('reserved')}</dt>
          <dd className="mt-1 text-figure tabular-nums wrap-long-words">{amount(data.reservedCents)}</dd>
        </dl>
        <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
          <span className="h-full rounded-full bg-primary transition-[width] duration-700 ease-spring" style={{ width: `${String(share(data.amounts.capture.cents, data.reservedCents))}%` }} />
          <span className="h-full rounded-full bg-success transition-[width] duration-700 ease-spring" style={{ width: `${String(share(data.amounts.release.cents, data.reservedCents))}%` }} />
        </div>
        <dl className={cn('grid gap-2 sm:grid-cols-2', parts.length > 2 && 'lg:grid-cols-3')}>
          {parts.map((part) => (
            <div key={part.key} className="min-w-0 rounded-xl bg-muted/60 px-3.5 py-3">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', part.swatch)} />
                {t(part.key)}
              </dt>
              <dd className="figures mt-1 text-xl font-semibold wrap-long-words">{amount(part.cents)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  )
}
