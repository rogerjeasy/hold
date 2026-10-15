import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { HoldSummary } from './decisions'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const standings = [
  { key: 'assured', swatch: 'bg-foreground' },
  { key: 'valid', swatch: 'bg-border-strong' },
  { key: 'ending', swatch: 'bg-primary' },
] as const

// What the shop holds on its renters' PayPal accounts, and how much of it is near the end of PayPal's clock.
export function HoldsPanel({ holds, clock }: { holds: HoldSummary; clock: ShopClock }) {
  const t = useTranslations('today.holds')
  const format = useShopFormat(clock)

  return (
    <Panel title={t('title')}>
      <div className="p-4 md:p-5">
        {holds.count === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <>
            <p className="text-figure wrap-long-words">{format.money(holds.heldCents)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('total', { count: holds.count })}</p>
            <div aria-hidden="true" className="mt-5 flex h-3 gap-0.5">
              {standings.map(({ key, swatch }) => (holds[key] === 0 ? null : <span key={key} className={swatch} style={{ flexGrow: holds[key] }} />))}
            </div>
            <ul className="mt-4 grid gap-2 text-[0.9375rem]">
              {standings.map(({ key, swatch }) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={`size-2.5 shrink-0 ${swatch}`} />
                  <span className="min-w-0 flex-1">{t(key)}</span>
                  <span className="figures">{holds[key]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 border-t pt-3 text-[0.8125rem] text-muted-foreground">{t('note', { max: HOLD_VALIDITY_DAYS })}</p>
      </div>
    </Panel>
  )
}
