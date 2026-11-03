'use client'

import type { ShopIncident } from '@hold/db'
import { mayConfirmOffer, mayMakeShopMatter } from '@hold/domain'
import { ArrowUpRight, BellOff, OctagonAlert, Quote } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ConfirmPriceForm, ShopMatterForm } from './incident-staff-forms'

// Waiting for a person stands out; settled and agreed read as done.
const STATE_TONES: Readonly<Record<ShopIncident['state'], StatusTone>> = {
  reported: 'progress',
  triaged: 'progress',
  agreed: 'success',
  shop_matter: 'neutral',
  awaiting_staff: 'attention',
  claim_opened: 'progress',
  resolved: 'success',
  withdrawn: 'neutral',
}

// One report as staff see it: what, where it stands, the renter's words as a quotation, how it was sorted, and the
// decision it waits for.
export function IncidentCard({ incident, clock, canAct }: { incident: ShopIncident; clock: ShopClock; canAct: boolean }) {
  const t = useTranslations('shop.incidents')
  const format = useShopFormat(clock)
  const titleId = `incident-${incident.id}`
  const theft = incident.theftDetails
  const unsafe = incident.safety || incident.kind === 'unsafe_or_unclear'
  const confirming = canAct && mayConfirmOffer(incident) && incident.offer === null && incident.prices.length > 0
  const takingOn = canAct && mayMakeShopMatter(incident)
  return (
    <article aria-labelledby={titleId} className="surface grid min-w-0 content-start overflow-clip">
      <header className="grid gap-2 border-b border-border/70 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <h2 id={titleId} className="min-w-0 text-[1.0625rem] leading-tight font-extrabold tracking-tight wrap-long-words">{incident.itemLabel} · {t(`kinds.${incident.kind ?? 'unsorted'}`)}</h2>
          <StatusPill tone={STATE_TONES[incident.state]} live={incident.state === 'awaiting_staff'}>{t(`states.${incident.state}`)}</StatusPill>
        </div>
        <p className="text-sm text-muted-foreground wrap-long-words">{t('reported', { when: `${format.day(incident.reportedAt)} ${format.time(incident.reportedAt)}`, renter: incident.renterName ?? t('renter') })}</p>
      </header>
      {unsafe ? (
        <p className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/8 px-4 py-2.5 font-semibold text-destructive md:px-5">
          <OctagonAlert aria-hidden="true" className="size-4.5 shrink-0" />
          {t('safety')}
        </p>
      ) : null}
      <div className="grid gap-4 px-4 py-4 md:px-5">
        <figure className="relative min-w-0 rounded-xl bg-muted/60 py-3 pr-3.5 pl-10">
          <Quote aria-hidden="true" className="absolute top-3.5 left-3.5 size-4 text-muted-foreground" />
          <blockquote className="min-w-0 whitespace-pre-wrap wrap-long-words">{incident.description}</blockquote>
        </figure>
        {theft === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{t('theft', { where: theft.where, when: theft.when, lockAndKeys: theft.lockAndKeys, police: theft.policeReport === '' ? t('notYet') : theft.policeReport })}</p>}
        {incident.offer === null ? null : <p className="wrap-long-words">{t('offer', { description: incident.offer.description, amount: format.money(incident.offer.amountCents) })}</p>}
        {incident.agreedCents === null ? null : <p className="w-fit rounded-xl bg-success/10 px-3 py-1.5 font-semibold">{t('agreed', { amount: format.money(incident.agreedCents) })}</p>}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {incident.simulated ? <SampleTag /> : null}
          {incident.triageOutcome !== 'answered' ? t('sortedByCode') : incident.simulated ? t('sortedBySimulated') : t('sortedBy', { model: incident.model ?? '' })}
        </p>
        {incident.staffAlertedAt === null ? (
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <BellOff aria-hidden="true" className="size-4 shrink-0" />
            {t('notAlerted')}
          </p>
        ) : null}
      </div>
      {confirming || takingOn ? (
        <div className="grid gap-4 border-t border-border/70 bg-muted/30 px-4 py-4 md:px-5">
          {confirming ? <ConfirmPriceForm incident={incident} clock={clock} /> : null}
          {takingOn ? <ShopMatterForm incidentId={incident.id} /> : null}
        </div>
      ) : null}
      <div className="border-t border-border/70 px-2 py-1 md:px-3">
        <Link href={rentalRoutes.rental(incident.rentalId)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-semibold text-primary underline-offset-4 hover:underline">
          {t('openRental')}
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  )
}
