import { money } from '@hold/domain'
import { Rewind } from 'lucide-react'
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
    <section role="status" className="surface grid animate-pop gap-4 p-4 md:p-5">
      <h3 className="flex items-center gap-2.5 text-[1.0625rem] leading-tight font-extrabold tracking-tight">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Rewind className="size-4" /></span>
        {t('title', { count: replay.rentals })}
      </h3>
      <dl className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-muted/60 p-3.5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-figure wrap-long-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t('note')}</p>
    </section>
  )
}
