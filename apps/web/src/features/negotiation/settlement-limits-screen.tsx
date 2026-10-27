import { formatMoney, money } from '@hold/domain'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import { shopRoutes } from '@/lib/routes'
import { SettlementLimitsForm } from './settlement-limits-form'

export type CurrentLimits = { readonly lowestSharePercent: number; readonly largestClaimCents: number; readonly rounds: number; readonly evidenceRequired: boolean; readonly validUntil: Date }

// The shop advocate's limits (extensions.md section 9.4), in shop settings. A mandate's limits are shown only to the
// person who grants them, so only the owner sees them here, sets them with a passkey, or ends them.
export function SettlementLimitsScreen({ shopName, currency, current, canEdit, gate }: { shopName: string; currency: string | null; current: CurrentLimits | null; canEdit: boolean; gate?: { needed: boolean; hasPasskey: boolean; email: string } }) {
  const t = useTranslations('negotiation.limits')
  const locale = useLocale()
  const format = useFormatter()
  const form = currency === null ? null : <SettlementLimitsForm currency={currency} current={current} />
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-3xl gap-8">
        <p className="max-w-prose text-pretty">{t('intro')}</p>
        {!canEdit ? <p className="text-muted-foreground">{t('ownerOnly')}</p> : (
          <>
            <Panel title={t('current')}>
              <div className="grid gap-2 p-4 md:p-5">
                {current === null || currency === null ? <p>{t('none')}</p> : (
                  <>
                    <p>{t('summary', { share: current.lowestSharePercent, largest: formatMoney(money(current.largestClaimCents, currency), locale), rounds: current.rounds, until: format.dateTime(current.validUntil, { dateStyle: 'medium' }) })}</p>
                    <p>{t(current.evidenceRequired ? 'evidenceYes' : 'evidenceNo')}</p>
                  </>
                )}
                <p>{t('finalTap')}</p>
              </div>
            </Panel>
            {form === null ? <p className="text-muted-foreground">{t('noCurrency')}</p> : gate?.needed === true ? <PasskeyGate {...gate} returnTo={shopRoutes.settlement}>{form}</PasskeyGate> : form}
          </>
        )}
      </div>
    </ShopFrame>
  )
}
