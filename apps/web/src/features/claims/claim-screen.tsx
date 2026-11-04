'use client'
import type { ClaimMessage, ClaimPromise, ClaimWorkspace, ShopNegotiation } from '@hold/db'
import type { ApprovalRefused } from '@hold/domain'
import { formatMoney, money } from '@hold/domain'
import { FileText, Gavel, LoaderCircle, LockKeyhole, Quote } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { BackLink } from '@/components/ui/back-link'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { ShopFrame } from '@/features/shop/shop-frame'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import type { PasskeyGateState } from '@/features/shop/passkey-gate'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ApproveClaimForm, DecideClaimForm } from './claim-controls'
import type { SampleAdvocatesAllowance } from '@/features/negotiation/limits'
import type { RecordedRun } from '@/features/negotiation/recorded-run'
import { RecordedRunView } from '@/features/negotiation/recorded-run-view'
import { SampleAdvocatesForm } from '@/features/negotiation/sample-advocates-form'
import { ShopConfirmForm } from '@/features/negotiation/shop-confirm-form'
import { TranscriptView } from '@/features/negotiation/transcript-view'
import { ContestSummaryPanel } from '@/features/contest/contest-summary-panel'
import type { ContestView } from '@/features/contest/contest-summary-panel'
import { ClaimConversation } from '@/features/promise/claim-conversation'
import { PromiseStatus } from '@/features/promise/promise-status'
import { ClaimLines } from './claim-lines'
import { claimRefusals } from './claim-permissions'
import type { ClaimViewer } from './claim-permissions'
import { ClaimStart } from './claim-start'
import { SettlementMeter } from './settlement-meter'

type SampleAdvocates = { readonly allowance: SampleAdvocatesAllowance; readonly recording: RecordedRun | undefined }

type ClaimScreenProps = { shopName: string; timeZone?: string; data: ClaimWorkspace; canAct: boolean; canDecide?: boolean; photoUrls?: Readonly<Record<string, string>>; passkey?: PasskeyGateState; negotiation?: ShopNegotiation; contest?: ContestView; promise?: ClaimPromise | null; messages?: readonly ClaimMessage[]; renterName?: string | null; isOwner?: boolean; now?: Date | undefined; sampleAdvocates?: SampleAdvocates; viewer?: ClaimViewer }

const SENIOR = ['owner', 'manager']

// contest: the neutral summary of the renter's contest, shown above the decision (architecture.md section 6.15).
// sampleAdvocates: on a sample claim that waits for its reply, today's live runs left and the recorded live run.
// viewer: who is reading, so the page offers only the decisions the server would let them take (audit finding JW-M4).
export function ClaimScreen({ shopName, timeZone = 'UTC', data, canAct, canDecide = false, photoUrls = {}, passkey, negotiation, contest, promise = null, messages, renterName = null, isOwner = false, now, sampleAdvocates, viewer }: ClaimScreenProps) {
  const t = useTranslations('claim'); const locale = useLocale()
  const records = useTranslations('records')
  const advocates = useTranslations('negotiation')
  const promiseText = useTranslations('promise.shop')
  const amount = (cents: number) => formatMoney(money(cents, data.currency), locale)
  const pending = ['releasing', 'renewing', 'capturing'].includes(data.holdState) || data.claim?.state === 'charging' || (data.execution !== null && ['pending', 'submitted'].includes(data.execution.state))
  // While the advocates argue, the page looks again so each move appears as it is made.
  const arguing = negotiation?.transcript.state === 'open'
  useLookAgain(pending || arguing, { forMs: 600000 })
  // Releasing, approving and deciding need a passkey where the person's role asks for one. Preparing a claim does not.
  // The forms that decide money sit behind one prompt, however many of them apply.
  const decision = (forms: ReactNode) => passkey?.needed === true ? <PasskeyGate {...passkey} returnTo={rentalRoutes.claim(data.rentalId)} body={t('passkeyBody')}>{forms}</PasskeyGate> : forms
  const claim = data.claim
  // Once the shop missed the date it promised the renter, only the owner decides, and the renter reads the reason.
  const promiseMissed = promise?.standing === 'missed'
  const ownerOnly = promiseMissed && !isOwner
  // A renter's contest of a claim already charged early is decided as a contested claim is.
  const protectedContest = claim !== null && ['charging', 'charged', 'charge_failed'].includes(claim.state) && data.protectedReply && data.replies.some((reply) => reply.decision === 'contest')
  const contested = claim !== null && (['contested', 'escalated'].includes(claim.state) || protectedContest)
  const refusals = viewer === undefined || claim === null ? { approve: null, decide: null } : claimRefusals(viewer, claim, data.currency, contested, promiseMissed)
  const seniorConfirms = viewer === undefined || SENIOR.includes(viewer.role)
  const approvable = claim !== null && ['awaiting_approval', 'approved', 'presented'].includes(claim.state)
  const decidable = claim !== null && !ownerOnly && (claim.state === 'awaiting_approval' || contested)
  const claimForms = claim === null || !canAct ? [] : [
    approvable && refusals.approve === null ? <ApproveClaimForm key="approve" claimId={claim.id} /> : null,
    decidable && refusals.decide === null ? <DecideClaimForm key="decide" claim={claim} reasonShownToRenter={promiseMissed} /> : null,
    negotiation?.awaitingShop === true && seniorConfirms ? <ShopConfirmForm key="confirm" negotiationId={negotiation.transcript.id} agreed={amount(negotiation.transcript.agreedCents ?? 0)} /> : null,
  ].filter((form) => form !== null)
  // What this person may not decide here, each said once, in place of a button the server would refuse.
  const notYours = (claim === null || !canAct ? [] : [
    approvable && refusals.approve !== null ? refusalWords(refusals.approve, 'approve') : null,
    decidable && refusals.decide !== null ? refusalWords(refusals.decide, contested ? 'decide' : 'waive') : null,
    negotiation?.awaitingShop === true && !seniorConfirms ? ('confirmSenior' as const) : null,
  ]).filter((key): key is LimitKey => key !== null)
  const limit = viewer === undefined ? '' : amount(viewer.approvalLimitCents)

  return <ShopFrame shopName={shopName} title={t('title')} actions={<>
    <BackLink href={rentalRoutes.rental(data.rentalId)}>{t('back')}</BackLink>
    <Button asChild variant="ghost"><Link href={rentalRoutes.record(data.rentalId)}><FileText aria-hidden="true" />{records('title')}</Link></Button>
  </>}><div className="grid gap-6">
    {data.simulated ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
    <Notice title={t('humanDecision')} body={t('boundary')} />
    {promise === null ? null : <PromiseStatus promise={promise} audience="shop" claimState={data.claim?.state ?? 'contested'} shopName={shopName} timeZone={timeZone} now={now ?? new Date()} />}
    {data.rentalState === 'closed' ? <Notice tone="success" title={t('settled')} body={t('settledBody')} /> : null}
    {pending ? <p role="status" className="flex items-center gap-2.5 justify-self-start rounded-full bg-primary/10 px-4 py-2 font-semibold text-primary"><LoaderCircle aria-hidden="true" className="size-4.5 shrink-0 animate-spin" />{t('pending')}</p> : null}
    {data.execution?.state === 'failed' ? <Notice tone="destructive" title={t('failed')} body={t('failedBody')} /> : null}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-6">
        {claim === null ? canAct && !data.simulated && ['returned', 'inspecting'].includes(data.rentalState) ? <ClaimStart data={data} decision={decision} /> : <div className="surface px-5 py-8 text-center text-muted-foreground">{t('noClaim')}</div> : <>
          {contest === undefined ? null : <ContestSummaryPanel view={contest} audience="shop" timeZone={timeZone} rentalId={data.rentalId} canRewrite={canDecide} photos={Object.fromEntries(data.lines.map((line) => [line.id, { before: line.beforeKey === null ? null : (photoUrls[line.beforeKey] ?? null), after: line.afterKey === null ? null : (photoUrls[line.afterKey] ?? null), region: line.region }]))} />}
          <Panel title={t(`states.${claim.state}`)} icon={Gavel}>
            <div className="grid gap-5 p-4 md:p-5">
              <ClaimLines lines={data.lines} currency={data.currency} photoUrls={photoUrls} />
              {data.decisions.length === 0 ? null : <ul className="grid gap-1.5">{data.decisions.map((each, index) => <li key={index} className="text-sm text-muted-foreground">{t('decisionBy', { name: each.name ?? t('staff') })}</li>)}</ul>}
              {data.replies.map((reply, index) => <blockquote key={index} className="flex min-w-0 gap-3 rounded-xl bg-muted/60 px-4 py-3"><Quote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 whitespace-pre-wrap wrap-long-words">{reply.comment}</span></blockquote>)}
              {negotiation?.transcript.state === 'agreed' && negotiation.transcript.shopConfirmedAt !== null ? <p role="status" className="font-semibold">{advocates('confirm.waiting')}</p> : null}
              {ownerOnly && canAct ? <p className="flex gap-2 text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{promiseText('ownerOnly')}</p> : null}
              {notYours.length === 0 ? null : <ul className="grid gap-2">{notYours.map((key) => <li key={key} className="flex gap-2.5 rounded-xl border border-dashed border-border-strong px-3.5 py-3 text-[0.9375rem] text-muted-foreground"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 text-pretty">{t(`limits.${key}`, { limit })}</span></li>)}</ul>}
              {claimForms.length === 0 ? null : <div className="border-t border-border/70 pt-5">{decision(<div className="grid gap-6">{claimForms}</div>)}</div>}
              {/* Moves no money, so it never waits behind the passkey that guards the forms above. */}
              {sampleAdvocates !== undefined && data.simulated && claim.state === 'presented' && negotiation === undefined && canAct && canDecide ? <div className="border-t border-border/70 pt-5"><SampleAdvocatesForm rentalId={data.rentalId} allowance={sampleAdvocates.allowance} /></div> : null}
            </div>
          </Panel>
          {messages === undefined ? null : <ClaimConversation audience="shop" rentalId={data.rentalId} messages={messages} shopName={shopName} renterName={renterName} timeZone={timeZone} canWrite={canAct && claim.state !== 'closed'} />}
          {negotiation !== undefined ? <TranscriptView transcript={negotiation.transcript} /> : data.simulated && sampleAdvocates?.recording !== undefined ? <RecordedRunView run={sampleAdvocates.recording} /> : null}
        </>}
      </div>
      {/* The amounts come first on a phone, and stay beside the claim from lg. */}
      <div className="min-w-0 max-lg:order-first lg:sticky lg:top-6"><SettlementMeter data={data} /></div>
    </div>
  </div></ShopFrame>
}

type LimitKey = 'overLimit' | 'seniorApproves' | 'seniorDecides' | 'seniorWaives' | 'raisedIt' | 'confirmSenior'

// The words for why a decision is not this person's. A missed promise is already said by the promise itself.
function refusalWords(refused: ApprovalRefused, decision: 'approve' | 'decide' | 'waive'): LimitKey | null {
  switch (refused.kind) {
    case 'over_approval_limit':
      return 'overLimit'
    case 'raised_the_claim':
      return 'raisedIt'
    case 'owner_decides_after_promise':
      return null
    case 'role_may_not_confirm':
      return decision === 'approve' ? 'seniorApproves' : decision === 'decide' ? 'seniorDecides' : 'seniorWaives'
  }
}
