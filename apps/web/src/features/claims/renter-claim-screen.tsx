'use client'
import type { ClaimMessage, ClaimPromise } from '@hold/db'
import type { ClaimState, ConditionReply, HoldState, Region } from '@hold/domain'
import { formatMoney, money } from '@hold/domain'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { Textarea } from '@/components/ui/textarea'
import { RenterMessage } from '@/features/renter/renter-message'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { CodeSent } from '@/features/contact/code-sent'
import { useCodeSender } from '@/features/contact/use-code-sender'
import { AdvocateForm } from '@/features/negotiation/advocate-form'
import { ContestSummaryPanel } from '@/features/contest/contest-summary-panel'
import { ClaimConversation } from '@/features/promise/claim-conversation'
import { LineRepaired } from '@/features/repairs/line-repaired'
import { CheckEvidence } from '@/features/provenance/check-evidence'
import { EvidencePhoto } from '@/features/provenance/evidence-photo'
import { HandoverConfirmation } from '@/features/provenance/handover-confirmation'
import type { ProvenanceView } from '@/features/provenance/photo-provenance'
import { PromiseBeforeContest, PromiseStatus } from '@/features/promise/promise-status'
import type { ContestView } from '@/features/contest/contest-summary-panel'
import { acknowledgeClaim, acceptClaim, contestClaim, sendClaimCode } from './renter-actions'

export type RenterClaimData = { readonly shopName: string; readonly currency: string; readonly state: ClaimState; readonly totalCents: number; readonly captureCents: number; readonly releaseCents: number; readonly invoiceCents: number; readonly replyDueAt: Date | null; readonly holdState: HoldState; readonly canReply: boolean; readonly canAcknowledge?: boolean; readonly pendingSettlement?: boolean; readonly canAdvocate?: boolean; readonly assistantName?: string | null; readonly negotiation?: boolean; readonly lines: readonly { readonly id: string; readonly description: string; readonly reason: string; readonly amountCents: number; readonly actorName: string | null; readonly beforeUrl: string | null; readonly afterUrl: string | null; readonly region?: Region | null; readonly repair?: { readonly repairedAt: Date; readonly url: string | null } | null; readonly itemId?: string | null; readonly beforeProvenance?: ProvenanceView | null; readonly afterProvenance?: ProvenanceView | null }[]; readonly confirmed?: { readonly reply: ConditionReply; readonly at: Date } | null; readonly timeZone?: string; readonly contest?: ContestView | undefined; readonly promise?: ClaimPromise | null; readonly messages?: readonly ClaimMessage[]; readonly canWrite?: boolean; readonly now?: Date }

export function RenterClaimScreen({ token, data }: { token: string; data: RenterClaimData }) {
  const t = useTranslations('claim'); const locale = useLocale(); const format = useFormatter()
  const records = useTranslations('records')
  const advocate = useTranslations('negotiation')
  const amount = (cents: number) => formatMoney(money(cents, data.currency), locale)
  const [acknowledged, acknowledge, acknowledging] = useActionState(acknowledgeClaim, null)
  const code = useCodeSender(sendClaimCode, { token, locale })
  const [accepted, accept, accepting] = useActionState(acceptClaim, null)
  const [contested, contest, contesting] = useActionState(contestClaim, null)
  const pending = data.pendingSettlement === true || data.state === 'charging' || ['releasing', 'capturing', 'renewing'].includes(data.holdState)
  useLookAgain(pending || accepted?.ok === true || contested?.ok === true, { forMs: 180000 })
  // Once the renter has contested, the conversation is what they come back for, so it sits near the top.
  const awaitingDecision = data.promise?.decideBy != null
  const conversation = data.messages === undefined ? null : <ClaimConversation audience="renter" token={token} messages={data.messages} shopName={data.shopName} renterName={null} timeZone={data.timeZone ?? 'UTC'} canWrite={data.canWrite === true} />
  const wording = Object.fromEntries(['code_expired', 'wrong_code', 'code_recently_sent', 'reply_expired', 'already_replied', 'reason_required', 'email_unavailable'].map((key) => [key, t(`results.${key}` as Parameters<typeof t>[0])]))
  return <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 md:px-8 md:py-12">
    <header><p className="label text-xs text-muted-foreground wrap-long-words">{data.shopName}</p><h1 className="mt-3 text-page-title text-balance">{t('renterTitle')}</h1></header>
    <Link href={linkRoutes.record(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{records('title')}</Link>
    {data.negotiation === true ? <Link href={linkRoutes.negotiation(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{advocate('link')}</Link> : null}
    <Notice title={t(`renterStates.${data.state}`)} body={data.state === 'closed' ? t('settledBody') : t('renterBoundary')} />
    {data.promise == null ? null : <PromiseStatus promise={data.promise} audience="renter" claimState={data.state} shopName={data.shopName} timeZone={data.timeZone ?? 'UTC'} now={data.now ?? new Date()} />}
    {pending ? <p role="status">{t('pending')}</p> : null}
    {data.replyDueAt === null || !data.canReply ? null : <p>{t('replyDue', { when: format.dateTime(data.replyDueAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
    <Panel title={t('summary')}><dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-4"><dt>{t('capture')}</dt><dd className="figures">{amount(data.captureCents)}</dd><dt>{t('release')}</dt><dd className="figures">{amount(data.releaseCents)}</dd>{data.invoiceCents > 0 ? <><dt>{t('invoice')}</dt><dd>{amount(data.invoiceCents)}</dd></> : null}</dl></Panel>
    {awaitingDecision ? conversation : null}
    {data.contest === undefined ? null : <ContestSummaryPanel view={data.contest} audience="renter" timeZone={data.timeZone ?? 'UTC'} photos={Object.fromEntries(data.lines.map((line) => [line.id, { before: line.beforeUrl, after: line.afterUrl, region: line.region ?? null }]))} />}
    {data.confirmed == null ? null : <HandoverConfirmation confirmed={data.confirmed} timeZone={data.timeZone ?? 'UTC'} />}
    {data.lines.map((line) => <Panel key={line.id} title={line.description}><div className="grid gap-3 p-4"><p className="font-semibold">{amount(line.amountCents)}</p><p className="whitespace-pre-wrap wrap-long-words">{line.reason}</p><p>{t('namedBy', { name: line.actorName ?? t('staff') })}</p><div className="grid gap-4 sm:grid-cols-2">{(['before', 'after'] as const).map((side) => { const url = line[`${side}Url`]; return url === null ? null : <EvidencePhoto key={side} caption={t(`${side}Url`)} url={url} provenance={line[`${side}Provenance`] ?? null} timeZone={data.timeZone ?? 'UTC'} /> })}</div>{line.itemId == null ? null : <CheckEvidence token={token} itemId={line.itemId} />}{line.repair == null ? null : <LineRepaired description={line.description} repairedAt={line.repair.repairedAt} url={line.repair.url} timeZone={data.timeZone ?? 'UTC'} />}</div></Panel>)}
    {data.canAcknowledge ? <form action={acknowledge} className="grid gap-3"><input type="hidden" name="token" value={token} /><input type="hidden" name="locale" value={locale} /><p>{t('reviewFirst')}</p><Button disabled={acknowledging} className="min-h-12 justify-self-start whitespace-normal">{t('acknowledge')}</Button><RenterMessage result={acknowledged} wording={wording} /></form> : null}
    {data.canReply ? <Panel title={t('yourReply')}><div className="grid gap-6 p-4 md:p-5">
      {data.promise != null && data.state === 'presented' ? <PromiseBeforeContest shopName={data.shopName} days={data.promise.days} /> : null}
      <div className="grid gap-3"><p>{t('codeGuidance')}</p><Button type="button" onClick={code.send} disabled={code.pending} className="min-h-12 justify-self-start whitespace-normal">{t('sendCode')}</Button><CodeSent result={code.result} pending={code.pending} onEmailInstead={code.sendByEmail} codeInputId="claim-code" emailWords={{ sent: t('codeSent'), sandbox: t('codeSentSandbox') }} wording={wording} /></div>
      <form action={accept} className="grid gap-3"><input type="hidden" name="token" value={token} /><input type="hidden" name="locale" value={locale} /><Label htmlFor="claim-code">{t('code')}</Label><Input id="claim-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} /><Label htmlFor="claim-comment">{t('comment')}</Label><Textarea id="claim-comment" name="comment" maxLength={1000} /><div className="flex flex-wrap gap-3"><Button type="submit" disabled={accepting || contesting} className="min-h-12 whitespace-normal">{t('accept')}</Button><Button type="submit" formAction={contest} variant="outline" disabled={accepting || contesting} className="min-h-12 whitespace-normal">{t('contest')}</Button></div><RenterMessage result={accepted} wording={wording} /><RenterMessage result={contested} wording={wording} /></form>
      {data.canAdvocate === true ? <AdvocateForm token={token} currency={data.currency} assistantName={data.assistantName ?? null} /> : null}
    </div></Panel> : null}
    {awaitingDecision ? null : conversation}
  </div>
}
