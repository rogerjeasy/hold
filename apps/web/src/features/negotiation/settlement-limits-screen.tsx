import { formatMoney, money } from '@hold/domain'
import { Scale } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { SettingsCard } from '@/components/ui/settings-card'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import type { PasskeyGateState } from '@/features/shop/passkey-gate'
import { shopRoutes } from '@/lib/routes'
import { SettlementLimitsForm } from './settlement-limits-form'

export type CurrentLimits = { readonly lowestSharePercent: number; readonly largestClaimCents: number; readonly rounds: number; readonly evidenceRequired: boolean; readonly validUntil: Date }

// The shop advocate's limits (extensions.md section 9.4), on the contested-claims settings page. A mandate's limits are
// shown only to the person who grants them, so only the owner sees them here, sets them with a passkey, or ends them.
export function SettlementLimitsSection({ currency, current, canEdit, gate }: { currency: string | null; current: CurrentLimits | null; canEdit: boolean; gate?: PasskeyGateState }) {
  const t = useTranslations('negotiation.limits')
  const locale = useLocale()
  const format = useFormatter()
  const form = currency === null ? null : <SettlementLimitsForm currency={currency} current={current} />
  return (
    <SettingsCard title={t('title')} lead={t('intro')} icon={Scale}>
      {!canEdit ? <p className="text-muted-foreground">{t('ownerOnly')}</p> : (
        <div className="grid gap-6">
          <div className="grid gap-2 rounded-xl bg-muted/50 p-4">
            <p className="label text-xs text-muted-foreground">{t('current')}</p>
            {current === null || currency === null ? <p className="font-semibold">{t('none')}</p> : (
              <>
                <p className="font-semibold">{t('summary', { share: current.lowestSharePercent, largest: formatMoney(money(current.largestClaimCents, currency), locale), rounds: current.rounds, until: format.dateTime(current.validUntil, { dateStyle: 'medium' }) })}</p>
                <p>{t(current.evidenceRequired ? 'evidenceYes' : 'evidenceNo')}</p>
              </>
            )}
            <p className="text-sm text-muted-foreground">{t('finalTap')}</p>
          </div>
          {form === null ? <p className="text-muted-foreground">{t('noCurrency')}</p> : gate?.needed === true ? <PasskeyGate {...gate} inline returnTo={shopRoutes.settlement}>{form}</PasskeyGate> : form}
        </div>
      )}
    </SettingsCard>
  )
}
