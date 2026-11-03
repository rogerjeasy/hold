'use client'
import { Timer } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { SettingsCard } from '@/components/ui/settings-card'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import type { PasskeyGateState } from '@/features/shop/passkey-gate'
import { shopRoutes } from '@/lib/routes'
import { PromiseBeforeContest } from './promise-status'
import { GrantWaiverForm, PromiseDaysForm, RevokeWaiverForm } from './promise-forms'

type Waiver = { readonly validUntil: Date; readonly dailyCount: number }
type Gate = PasskeyGateState

// The shop's promise to decide a contested claim, and the optional rule that waives one not decided in time
// (architecture.md section 6.16). Every staff member reads the promise; only the owner changes it or the rule.
export function PromiseSettingsSection({ shopName, days, waiver, canEdit, gate }: { shopName: string; days: number; waiver: Waiver | null; canEdit: boolean; gate?: Gate }) {
  const t = useTranslations('promise')
  const format = useFormatter()
  const grant = <GrantWaiverForm />
  return (
    <SettingsCard title={t('title')} lead={t('lead')} icon={Timer}>
      <div className="grid gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {canEdit ? <PromiseDaysForm days={days} /> : <p>{t('readOnly', { days })}</p>}
          <div className="grid min-w-0 gap-2">
            <p className="label text-xs text-muted-foreground">{t('preview')}</p>
            <PromiseBeforeContest shopName={shopName} days={days} />
          </div>
        </div>
        <div className="grid gap-3 border-t border-border/70 pt-5">
          <h3 className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('waiver.title')}</h3>
          <p className="max-w-prose text-[0.9375rem] text-pretty text-muted-foreground">{t('waiver.lead')}</p>
          {/* A sentence, not a pill: the rule's limits are read in full, so it wraps instead of being cut short. */}
          <p className={`flex w-fit max-w-full items-start gap-2 rounded-xl px-3 py-2 font-semibold ${waiver === null ? 'bg-muted' : 'bg-success/10'}`}>
            <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${waiver === null ? 'bg-muted-foreground' : 'animate-pulse-ring bg-success text-success'}`} />
            {waiver === null ? t('waiver.off') : t('waiver.live', { until: format.dateTime(waiver.validUntil, { dateStyle: 'medium' }), count: waiver.dailyCount })}
          </p>
          {!canEdit ? <p className="text-muted-foreground">{t('waiver.ownerOnly')}</p> : (
            <>
              {gate?.needed === true ? <PasskeyGate {...gate} inline returnTo={shopRoutes.settlement}>{grant}</PasskeyGate> : grant}
              {waiver === null ? null : <RevokeWaiverForm />}
            </>
          )}
        </div>
      </div>
    </SettingsCard>
  )
}
