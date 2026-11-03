'use client'

import type { RenterIncident } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { OctagonAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { IncidentAgreeForm } from './incident-agree-form'
import { outcomeOf } from './incident-outcome'
import { IncidentTheftForm } from './incident-theft-form'

// The result of the sorting, as the renter sees it: a fixed message for each kind, the confirmed price and the way to
// agree it for small damage, the fixed steps for a theft. For anything unsafe or unclear, the fixed message alone.
export function IncidentOutcomePanel({ token, incident }: { token: string; incident: RenterIncident }) {
  const t = useTranslations('renter.incident.outcome')
  const locale = useLocale()
  const outcome = outcomeOf(incident)
  const price = incident.offer === null ? '' : formatMoney(money(incident.offer.amountCents, incident.offer.currency), locale)
  if (outcome === 'unsafe') {
    return (
      <section aria-labelledby="incident-unsafe" className="grid animate-rise gap-3 rounded-2xl border border-destructive/40 bg-destructive/6 p-4 shadow-card md:p-5">
        <h2 id="incident-unsafe" className="flex items-center gap-2 text-lg font-semibold"><OctagonAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />{t('unsafe.title')}</h2>
        <p>{t('unsafe.stop')}</p>
        <p>{t('unsafe.contact')}</p>
        <p className="font-semibold">{t('unsafe.emergency')}</p>
      </section>
    )
  }
  return (
    <Panel title={t(`${outcome}.title`)}>
      <div className="grid gap-4 px-4 py-4 md:px-5">
        {incident.simulated ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><SampleTag />{t('simulated')}</p> : null}
        <p>{t(`${outcome}.body`, { price, description: incident.offer?.description ?? '' })}</p>
        {outcome === 'pricing' && incident.confirmation !== null ? <p className="whitespace-pre-wrap wrap-long-words">{incident.confirmation}</p> : null}
        {outcome === 'offer' ? <IncidentAgreeForm token={token} incidentId={incident.id} price={price} /> : null}
        {outcome === 'agreed' && incident.agreedCents !== null ? <Notice title={t('agreed.amount', { price: formatMoney(money(incident.agreedCents, incident.currency), locale) })} body={t('agreed.notCharged')} /> : null}
        {outcome === 'theft' ? <IncidentTheftForm token={token} incidentId={incident.id} details={incident.theftDetails} /> : null}
      </div>
    </Panel>
  )
}
