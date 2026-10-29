'use client'
import { useFormatter, useTranslations } from 'next-intl'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { shopRoutes } from '@/lib/routes'
import { PromiseBeforeContest } from './promise-status'
import { GrantWaiverForm, PromiseDaysForm, RevokeWaiverForm } from './promise-forms'

type Waiver = { readonly validUntil: Date; readonly dailyCount: number }
type Gate = { readonly needed: boolean; readonly hasPasskey: boolean; readonly email: string }

// The shop's promise to decide a contested claim, and the optional rule that waives one not decided in time
// (architecture.md section 6.16). Every staff member reads the promise; only the owner changes it or the rule.
export function PromiseSettingsSection({ shopName, days, waiver, canEdit, gate }: { shopName: string; days: number; waiver: Waiver | null; canEdit: boolean; gate?: Gate }) {
  const t = useTranslations('promise')
  const format = useFormatter()
  const grant = <GrantWaiverForm />
  return (
    <section aria-labelledby="decision-promise" className="grid max-w-3xl gap-5">
      <div className="grid gap-2">
        <h2 id="decision-promise" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('lead')}</p>
      </div>
      {canEdit ? <PromiseDaysForm days={days} /> : <p>{t('readOnly', { days })}</p>}
      <div className="grid gap-2">
        <p className="label text-xs text-muted-foreground">{t('preview')}</p>
        <PromiseBeforeContest shopName={shopName} days={days} />
      </div>
      <div className="grid gap-3 border-t pt-5">
        <h3 className="text-lg leading-tight font-extrabold tracking-tight">{t('waiver.title')}</h3>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('waiver.lead')}</p>
        <p className="font-semibold">{waiver === null ? t('waiver.off') : t('waiver.live', { until: format.dateTime(waiver.validUntil, { dateStyle: 'medium' }), count: waiver.dailyCount })}</p>
        {!canEdit ? <p className="text-muted-foreground">{t('waiver.ownerOnly')}</p> : (
          <>
            {gate?.needed === true ? <PasskeyGate {...gate} returnTo={shopRoutes.settlement}>{grant}</PasskeyGate> : grant}
            {waiver === null ? null : <RevokeWaiverForm />}
          </>
        )}
      </div>
    </section>
  )
}
