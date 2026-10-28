'use client'
import type { RenterNegotiation } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
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
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 md:px-8 md:py-12">
      <header>
        <p className="label text-xs text-muted-foreground wrap-long-words">{shopName}</p>
        <h1 className="mt-3 text-page-title text-balance">{t('renterTitle')}</h1>
      </header>
      <Link href={linkRoutes.claim(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{claim('renterTitle')}</Link>
      <p>{t('yourLimit', { amount: amount(data.highestTotalCents) })}</p>
      {data.advocate === 'assistant' ? <p>{t('assistantArgues')}</p> : null}
      <TranscriptView transcript={data.transcript} />
      {data.transcript.state === 'agreed' && data.transcript.renterConfirmedAt !== null ? <p role="status">{t('confirm.waitingShop')}</p> : null}
      {canAct && data.awaitingRenter ? <SettlementConfirmForm token={token} agreed={amount(data.transcript.agreedCents ?? 0)} /> : null}
      {data.stopped ? <p>{t('stop.stopped')}</p> : canAct && running ? <StopAdvocateForm token={token} /> : null}
    </div>
  )
}
