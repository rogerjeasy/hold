'use client'
import type { ClaimWorkspace } from '@hold/db'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { PhotoWithMarks } from '@/components/photo-with-marks'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { ShopFrame } from '@/features/shop/shop-frame'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { useLookAgain } from '@/hooks/use-look-again'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { ApproveClaimForm, CleanReleaseForm, DecideClaimForm } from './claim-controls'
import { ClaimDraftForm } from './claim-draft-form'

// Whether this session must still be proven by a passkey before a money decision, and how to offer it.
type PasskeyState = { readonly needed: boolean; readonly hasPasskey: boolean; readonly email: string }

export function ClaimScreen({ shopName, data, canAct, photoUrls = {}, passkey }: { shopName: string; data: ClaimWorkspace; canAct: boolean; photoUrls?: Readonly<Record<string, string>>; passkey?: PasskeyState }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const records = useTranslations('records')
  const amount = (cents: number) => formatMoney(money(cents, data.currency), locale)
  const pending = ['releasing', 'renewing', 'capturing'].includes(data.holdState) || data.claim?.state === 'charging' || (data.execution !== null && ['pending', 'submitted'].includes(data.execution.state))
  useLookAgain(pending, { forMs: 180000 })
  // Releasing, approving and deciding need a passkey where the person's role asks for one. Preparing a claim does not.
  const decision = (form: ReactNode) => passkey?.needed === true ? <PasskeyGate {...passkey} returnTo={rentalRoutes.claim(data.rentalId)}>{form}</PasskeyGate> : form
  return <ShopFrame shopName={shopName} title={t('title')}><div className="grid gap-6">
    <Link href={rentalRoutes.rental(data.rentalId)} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{t('back')}</Link>
    <Link href={rentalRoutes.record(data.rentalId)} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{records('title')}</Link>
    <Notice title={t('humanDecision')} body={t('boundary')} />
    {data.rentalState === 'closed' ? <Notice title={t('settled')} body={t('settledBody')} /> : null}
    {pending ? <p role="status">{t('pending')}</p> : null}
    {data.execution?.state === 'failed' ? <Notice title={t('failed')} body={t('failedBody')} /> : null}
    <Panel title={t('summary')}><dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 md:px-5"><dt>{t('reserved')}</dt><dd className="figures">{amount(data.reservedCents)}</dd><dt>{t('capture')}</dt><dd className="figures">{amount(data.amounts.capture.cents)}</dd><dt>{t('release')}</dt><dd className="figures">{amount(data.amounts.release.cents)}</dd>{data.amounts.invoice.cents > 0 ? <><dt>{t('invoice')}</dt><dd className="figures">{amount(data.amounts.invoice.cents)}</dd></> : null}</dl></Panel>
    {data.claim === null ? canAct && !data.simulated && ['returned', 'inspecting'].includes(data.rentalState) ? <><Panel title={t('cleanTitle')}><div className="p-4 md:p-5">{decision(<CleanReleaseForm rentalId={data.rentalId} />)}</div></Panel><Panel title={t('draftTitle')}><div className="p-4 md:p-5"><ClaimDraftForm data={data} /></div></Panel></> : <p>{t('noClaim')}</p> : <>
      <Panel title={t(`states.${data.claim.state}`)}><div className="grid gap-4 p-4 md:p-5"><ul className="grid gap-4">{data.lines.map((line) => <li key={line.id} className="grid min-w-0 gap-1 border-b pb-3"><p className="font-semibold wrap-long-words">{line.description} · {amount(line.amountCents)}</p>{line.source === 'agreed_in_rental' ? <p className="text-sm font-semibold">{t('agreed.drafted')}</p> : null}<p className="whitespace-pre-wrap wrap-long-words">{line.reason ?? line.findingDescription ?? line.incidentDescription}</p><p className="text-sm text-muted-foreground">{t('namedBy', { name: line.actorName ?? t('staff') })}</p><div className="grid gap-4 sm:grid-cols-2">{(['beforeKey', 'afterKey'] as const).map((side) => { const key = line[side]; const url = key === null ? undefined : photoUrls[key]; const label = t(side === 'beforeKey' ? 'beforeUrl' : 'afterUrl'); return url === undefined ? null : <figure key={side}><figcaption className="mb-2 font-semibold">{label}</figcaption><PhotoWithMarks src={url} alt={label} marks={line.region === null ? [] : [{ id: line.id, region: line.region }]} /></figure> })}</div></li>)}</ul>
        {data.decisions.map((decision, index) => <p key={index}>{t('decisionBy', { name: decision.name ?? t('staff') })}</p>)}
        {canAct && ['awaiting_approval', 'approved', 'presented'].includes(data.claim.state) ? decision(<ApproveClaimForm claimId={data.claim.id} />) : null}
        {data.replies.map((reply, index) => <blockquote key={index} className="min-w-0 whitespace-pre-wrap border-l-2 pl-3 wrap-long-words">{reply.comment}</blockquote>)}
        {canAct && (['awaiting_approval', 'contested'].includes(data.claim.state) || (['charging', 'charged', 'charge_failed'].includes(data.claim.state) && data.protectedReply && data.replies.some((reply) => reply.decision === 'contest'))) ? decision(<DecideClaimForm claim={data.claim} />) : null}
      </div></Panel>
    </>}
  </div></ShopFrame>
}
