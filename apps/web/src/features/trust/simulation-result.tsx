import { money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/money'

export type Replay = { readonly rentals: number; readonly lowered: number; readonly loweredByCents: number; readonly claimsAboveLoweredHold: number; readonly uncoveredCents: number }

// What a candidate ladder would have done to the shop's past rentals, worked out by plain code (extensions.md 7.8).
export function SimulationResult({ replay, currency }: { replay: Replay; currency: string }) {
  const t = useTranslations('trust.ladder.simulation')
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, currency), locale)
  const figures = [
    [t('lowered'), String(replay.lowered)],
    [t('loweredBy'), amount(replay.loweredByCents)],
    [t('claimsAbove'), String(replay.claimsAboveLoweredHold)],
    [t('uncovered'), amount(replay.uncoveredCents)],
  ] as const
  return (
    <section role="status" className="grid gap-3 border bg-card p-4 text-card-foreground md:p-5">
      <h3 className="font-semibold">{t('title', { count: replay.rentals })}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-figure wrap-long-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t('note')}</p>
    </section>
  )
}
