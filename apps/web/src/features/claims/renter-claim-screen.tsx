'use client'
import type { ClaimMessage, ClaimPromise } from '@hold/db'
import type { ClaimState, ConditionReply, HoldState, Region } from '@hold/domain'
import { formatMoney, money } from '@hold/domain'
import { Clock, LoaderCircle, Scale } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { RenterMessage } from '@/features/renter/renter-message'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { ContestSummaryPanel } from '@/features/contest/contest-summary-panel'
import { ClaimConversation } from '@/features/promise/claim-conversation'
import { LineRepaired } from '@/features/repairs/line-repaired'
import { CheckEvidence } from '@/features/provenance/check-evidence'
import { HandoverConfirmation } from '@/features/provenance/handover-confirmation'
import type { ProvenanceView } from '@/features/provenance/photo-provenance'
import { PromiseStatus } from '@/features/promise/promise-status'
import type { ContestView } from '@/features/contest/contest-summary-panel'
import { ItemPhotoPairs, PhotoPair } from './renter-claim-evidence'
import type { ItemPhotos } from './renter-claim-evidence'
import { RenterClaimReply } from './renter-claim-reply'
import { RenterClaimSummary } from './renter-claim-summary'
import { acknowledgeClaim, acceptClaim, contestClaim } from './renter-actions'

type RenterClaimLine = { readonly id: string; readonly description: string; readonly reason: string; readonly amountCents: number; readonly actorName: string | null; readonly beforeUrl: string | null; readonly afterUrl: string | null; readonly region?: Region | null; readonly repair?: { readonly repairedAt: Date; readonly url: string | null } | null; readonly itemId?: string | null; readonly beforeProvenance?: ProvenanceView | null; readonly afterProvenance?: ProvenanceView | null }

// itemPhotos: each item's sealed handover and return photographs, for the lines a person added without a pair.
export type RenterClaimData = { readonly shopName: string; readonly currency: string; readonly state: ClaimState; readonly totalCents: number; readonly captureCents: number; readonly releaseCents: number; readonly invoiceCents: number; readonly replyDueAt: Date | null; readonly holdState: HoldState; readonly canReply: boolean; readonly canAcknowledge?: boolean; readonly pendingSettlement?: boolean; readonly canAdvocate?: boolean; readonly assistantName?: string | null; readonly negotiation?: boolean; readonly lines: readonly RenterClaimLine[]; readonly itemPhotos?: readonly ItemPhotos[]; readonly confirmed?: { readonly reply: ConditionReply; readonly at: Date } | null; readonly timeZone?: string; readonly contest?: ContestView | undefined; readonly promise?: ClaimPromise | null; readonly messages?: readonly ClaimMessage[]; readonly canWrite?: boolean; readonly now?: Date }

// One line of the claim, read as evidence: what it is and its price from the published list, the words of the person
// who added it, then the photographs. A line with no pair of its own shows the item's handover and return.
function ClaimLine({ token, line, itemPhotos, amount, timeZone }: { token: string; line: RenterClaimLine; itemPhotos: readonly ItemPhotos[]; amount: string; timeZone: string }) {
  const t = useTranslations('claim')
  const page = useTranslations('claim.renterPage')
  const paired = line.beforeUrl !== null || line.afterUrl !== null
  return (
    <article className="surface grid min-w-0 gap-4 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="grid min-w-0 gap-1">
          <h3 className="text-[1.0625rem] leading-tight font-extrabold tracking-tight wrap-long-words">{line.description}</h3>
          <p className="label text-[0.6875rem] text-muted-foreground">{page('fromList')}</p>
        </div>
        <p className="figures shrink-0 text-lg font-semibold">{amount}</p>
      </header>
      <blockquote className="grid gap-1.5 border-l-2 border-primary/60 pl-3.5">
        <p className="whitespace-pre-wrap text-pretty wrap-long-words">{line.reason}</p>
        <footer className="text-sm text-muted-foreground">{t('namedBy', { name: line.actorName ?? t('staff') })}</footer>
      </blockquote>
      {paired ? <PhotoPair subject={line.description} before={{ url: line.beforeUrl, provenance: line.beforeProvenance ?? null }} after={{ url: line.afterUrl, provenance: line.afterProvenance ?? null }} region={line.region ?? null} timeZone={timeZone} /> : <ItemPhotoPairs items={itemPhotos} timeZone={timeZone} />}
      {line.itemId == null ? null : <CheckEvidence token={token} itemId={line.itemId} />}
      {line.repair == null ? null : <LineRepaired description={line.description} repairedAt={line.repair.repairedAt} url={line.repair.url} timeZone={timeZone} />}
    </article>
  )
}

// The renter's claim, opened from their link: a calm, photograph-first account of what the shop asks for and why, what
// it does to their hold, and their answer with a one-time code.
export function RenterClaimScreen({ token, data }: { token: string; data: RenterClaimData }) {
  const t = useTranslations('claim'); const locale = useLocale(); const format = useFormatter()
  const page = useTranslations('claim.renterPage')
  const records = useTranslations('records')
  const advocate = useTranslations('negotiation')
  const renter = useTranslations('renter.unavailable')
  const amount = (cents: number) => formatMoney(money(cents, data.currency), locale)
  const timeZone = data.timeZone ?? 'UTC'
  const [acknowledged, acknowledge, acknowledging] = useActionState(acknowledgeClaim, null)
  const [accepted, accept, accepting] = useActionState(acceptClaim, null)
  const [contested, contest, contesting] = useActionState(contestClaim, null)
  const pending = data.pendingSettlement === true || data.state === 'charging' || ['releasing', 'capturing', 'renewing'].includes(data.holdState)
  useLookAgain(pending || accepted?.ok === true || contested?.ok === true, { forMs: 180000 })
  // Once the renter has contested, the conversation is what they come back for, so it sits near the top.
  const awaitingDecision = data.promise?.decideBy != null
  const conversation = data.messages === undefined ? null : <ClaimConversation audience="renter" token={token} messages={data.messages} shopName={data.shopName} renterName={null} timeZone={timeZone} canWrite={data.canWrite === true} />
  const wording = Object.fromEntries(['code_expired', 'wrong_code', 'code_recently_sent', 'reply_expired', 'already_replied', 'reason_required', 'email_unavailable'].map((key) => [key, t(`results.${key}` as Parameters<typeof t>[0])]))
  const tone = data.state === 'waived' || data.state === 'closed' ? 'success' : data.state === 'charge_failed' || data.state === 'lapsed' ? 'warning' : 'neutral'
  return (
    <RenterPage className="max-w-3xl">
      <RenterHead shopName={data.shopName} title={t('renterTitle')}>
        {data.replyDueAt === null || !data.canReply ? null : (
          <p className="flex items-center gap-2 font-semibold">
            <Clock aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
            {t('replyDue', { when: format.dateTime(data.replyDueAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
          </p>
        )}
      </RenterHead>
      <Notice tone={tone} title={t(`renterStates.${data.state}`)} body={data.state === 'closed' ? t('settledBody') : t('renterBoundary')} />
      {data.negotiation === true ? (
        <Link href={linkRoutes.negotiation(token)} referrerPolicy="no-referrer" className="surface lift flex min-h-14 items-center gap-3 px-4 py-3 font-semibold md:px-5">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Scale className="size-4.5" /></span>
          <span className="min-w-0 wrap-long-words">{advocate('link')}</span>
        </Link>
      ) : null}
      {data.promise == null ? null : <PromiseStatus promise={data.promise} audience="renter" claimState={data.state} shopName={data.shopName} timeZone={timeZone} now={data.now ?? new Date()} />}
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4.5 shrink-0 animate-spin" />
          {t('pending')}
        </p>
      ) : null}
      <RenterClaimSummary captureCents={data.captureCents} releaseCents={data.releaseCents} invoiceCents={data.invoiceCents} amount={amount} />
      {awaitingDecision ? conversation : null}
      {data.contest === undefined ? null : <ContestSummaryPanel view={data.contest} audience="renter" timeZone={timeZone} photos={Object.fromEntries(data.lines.map((line) => [line.id, { before: line.beforeUrl, after: line.afterUrl, region: line.region ?? null }]))} />}
      {data.confirmed == null ? null : <HandoverConfirmation confirmed={data.confirmed} timeZone={timeZone} />}
      {data.lines.length === 0 ? null : (
        <section aria-label={page('evidence')} className="grid gap-4">
          <h2 className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{page('evidence')}</h2>
          <div className="stagger grid gap-4">
            {data.lines.map((line) => <ClaimLine key={line.id} token={token} line={line} itemPhotos={data.itemPhotos ?? []} amount={amount(line.amountCents)} timeZone={timeZone} />)}
          </div>
          <p className="flex items-baseline justify-between gap-4 border-t border-border-strong/60 px-1 pt-4">
            <span className="font-semibold">{page('total')}</span>
            <span className="figures text-lg font-semibold">{amount(data.totalCents)}</span>
          </p>
        </section>
      )}
      {data.canAcknowledge ? (
        <form action={acknowledge} className="surface grid gap-4 p-5 md:p-6">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <p className="text-pretty">{t('reviewFirst')}</p>
          <Button disabled={acknowledging} className="min-h-12 w-full whitespace-normal sm:w-auto sm:justify-self-start">{t('acknowledge')}</Button>
          <RenterMessage result={acknowledged} wording={wording} />
        </form>
      ) : null}
      {data.canReply ? <RenterClaimReply token={token} shopName={data.shopName} currency={data.currency} state={data.state} promise={data.promise ?? null} canAdvocate={data.canAdvocate === true} assistantName={data.assistantName ?? null} wording={wording} accept={{ result: accepted, send: accept, pending: accepting }} contest={{ result: contested, send: contest, pending: contesting }} /> : null}
      {awaitingDecision ? null : conversation}
      <nav aria-label={page('more')} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border/70 pt-4">
        <BackLink href={`${linkRoutes.renter}/${token}`}>{renter('back')}</BackLink>
        <Link href={linkRoutes.record(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{records('title')}</Link>
      </nav>
    </RenterPage>
  )
}
