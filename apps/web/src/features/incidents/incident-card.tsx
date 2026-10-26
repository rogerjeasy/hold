'use client'

import type { ShopIncident } from '@hold/db'
import { mayConfirmOffer, mayMakeShopMatter } from '@hold/domain'
import { OctagonAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ConfirmPriceForm, ShopMatterForm } from './incident-staff-forms'

// One report as staff see it: what, where it stands, the renter's words as a quotation, how it was sorted, and the
// decision it waits for.
export function IncidentCard({ incident, clock, canAct }: { incident: ShopIncident; clock: ShopClock; canAct: boolean }) {
  const t = useTranslations('shop.incidents')
  const format = useShopFormat(clock)
  const titleId = `incident-${incident.id}`
  const theft = incident.theftDetails
  return (
    <article aria-labelledby={titleId} className="grid min-w-0 gap-3 border bg-card p-4 md:p-5">
      <header className="grid gap-1">
        <h2 id={titleId} className="font-semibold wrap-long-words">{incident.itemLabel} · {t(`kinds.${incident.kind ?? 'unsorted'}`)}</h2>
        <p className="text-sm text-muted-foreground wrap-long-words">{t(`states.${incident.state}`)} · {t('reported', { when: `${format.day(incident.reportedAt)} ${format.time(incident.reportedAt)}`, renter: incident.renterName ?? t('renter') })}</p>
      </header>
      {incident.safety || incident.kind === 'unsafe_or_unclear' ? <p className="flex items-center gap-2 font-semibold text-destructive"><OctagonAlert aria-hidden="true" className="size-4.5 shrink-0" />{t('safety')}</p> : null}
      <blockquote className="min-w-0 whitespace-pre-wrap border-l-2 pl-3 wrap-long-words">{incident.description}</blockquote>
      {theft === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{t('theft', { where: theft.where, when: theft.when, lockAndKeys: theft.lockAndKeys, police: theft.policeReport === '' ? t('notYet') : theft.policeReport })}</p>}
      {incident.offer === null ? null : <p>{t('offer', { description: incident.offer.description, amount: format.money(incident.offer.amountCents) })}</p>}
      {incident.agreedCents === null ? null : <p className="font-semibold">{t('agreed', { amount: format.money(incident.agreedCents) })}</p>}
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {incident.simulated ? <SampleTag /> : null}
        {incident.triageOutcome !== 'answered' ? t('sortedByCode') : incident.simulated ? t('sortedBySimulated') : t('sortedBy', { model: incident.model ?? '' })}
      </p>
      {incident.staffAlertedAt === null ? <p className="text-sm">{t('notAlerted')}</p> : null}
      {canAct && mayConfirmOffer(incident) && incident.offer === null && incident.prices.length > 0 ? <ConfirmPriceForm incident={incident} clock={clock} /> : null}
      {canAct && mayMakeShopMatter(incident) ? <ShopMatterForm incidentId={incident.id} /> : null}
      <Link href={rentalRoutes.rental(incident.rentalId)} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{t('openRental')}</Link>
    </article>
  )
}
