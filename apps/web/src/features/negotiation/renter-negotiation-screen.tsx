'use client'
import type { RenterNegotiation } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { Scale } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useLookAgain } from '@/hooks/use-look-again'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { linkRoutes } from '@/lib/routes'
import { SettlementConfirmForm } from './settlement-confirm-form'
import { StopAdvocateForm } from './stop-advocate-form'
import { TranscriptView } from './transcript-view'

// The renter's advocate (extensions.md section 9): what the advocates said, the renter's own highest total, the final
// tap on an agreement, and a way to stop the advocate. The shop's limits are never part of what it is given.
export function RenterNegotiationScreen({ token, shopName, data, canAct = true }: { token: string; shopName: string; data: RenterNegotiation; canAct?: boolean }) {
  const t = useTranslations('negotiation')
  const locale = useLocale()
  const claim = useTranslations('claim')
  const amount = (cents: number) => formatMoney(money(cents, data.transcript.currency), locale)
  const running = data.transcript.state === 'open' || data.transcript.state === 'agreed'
  useLookAgain(data.transcript.state === 'open', { forMs: 180000 })
  return (
    <RenterPage className="max-w-3xl">
      <RenterHead shopName={shopName} title={t('renterTitle')} />
      <div className="surface flex min-w-0 animate-rise items-start gap-4 p-5 md:p-6">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Scale className="size-5" />
        </span>
        <div className="grid min-w-0 gap-1.5">
          <p className="text-lg font-semibold text-pretty">{t('yourLimit', { amount: amount(data.highestTotalCents) })}</p>
          {data.advocate === 'assistant' ? <p className="text-muted-foreground">{t('assistantArgues')}</p> : null}
        </div>
      </div>
      <TranscriptView transcript={data.transcript} />
      {data.transcript.state === 'agreed' && data.transcript.renterConfirmedAt !== null ? <p role="status">{t('confirm.waitingShop')}</p> : null}
      {canAct && data.awaitingRenter ? <SettlementConfirmForm token={token} agreed={amount(data.transcript.agreedCents ?? 0)} /> : null}
      {data.stopped ? <p>{t('stop.stopped')}</p> : canAct && running ? <StopAdvocateForm token={token} /> : null}
      <BackLink href={linkRoutes.claim(token)}>{claim('renterTitle')}</BackLink>
    </RenterPage>
  )
}
