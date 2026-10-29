import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { Bot, CircleSlash, SearchX, ShieldAlert, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Ref } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import { EntryActions } from '@/features/operations/entry-actions'
import { Link } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'
import type { BoardRow, IncidentRow, ProposalMark, ProposalRow } from './board'
import { ClaimDetail } from './claim-detail'
import { DropOffDetail } from './drop-off-detail'
import { ExtensionPaymentDetail } from './extension-payment-detail'
import { detailLinkClass, Fact, SubHeading } from '@/components/detail-parts'
import { RenterWords } from './detail-parts'
import type { RowText } from './use-row-text'

const MARK_ICONS: Readonly<Record<ProposalMark, LucideIcon>> = { raisedByAgent: Bot, notInvestigated: SearchX, paypalNotChecked: WifiOff, draftDropped: CircleSlash }

function ProposalDetail({ row, text, passkeyNeeded }: { row: ProposalRow; text: RowText; passkeyNeeded: boolean }) {
  const t = useTranslations('operations')
  return (
    <>
      <div className="grid gap-1">
        <SubHeading>{t('why')}</SubHeading>
        <p className="whitespace-pre-wrap wrap-long-words">{text.reason(row)}</p>
      </div>
      <div className="grid gap-1">
        <SubHeading>{t('references')}</SubHeading>
        {row.references.length === 0 ? <p className="text-sm">{t('noReferences')}</p> : (
          <ul className="flex flex-wrap gap-2">
            {row.references.map((reference) => <li key={reference} className="min-w-0 border px-2 py-0.5 font-mono text-sm wrap-long-words">{reference}</li>)}
          </ul>
        )}
      </div>
      {row.draft === null ? null : (
        <div className="grid gap-1">
          <SubHeading>{t('draft')}</SubHeading>
          <blockquote className="min-w-0 border-l-2 pl-3 whitespace-pre-wrap wrap-long-words">{row.draft}</blockquote>
        </div>
      )}
      {row.marks.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {row.marks.map((mark) => {
            const Icon = MARK_ICONS[mark]
            return (
              <li key={mark} className="inline-flex items-center gap-1.5 border border-border-strong px-2 py-1 text-sm">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(`marks.${mark}`)}
              </li>
            )
          })}
        </ul>
      )}
      {row.decider === 'you' ? <EntryActions proposalId={row.proposalId} kind={row.proposalKind} passkeyNeeded={passkeyNeeded} together={undefined} /> : null}
    </>
  )
}

function IncidentDetail({ row }: { row: IncidentRow }) {
  const t = useTranslations('decisions.detail')
  return (
    <>
      {row.safety ? (
        <p className="flex gap-2 border border-border-strong p-3 font-semibold">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          {t('safety')}
        </p>
      ) : null}
      <RenterWords words={row.description} />
      {row.suggestion === null ? null : <p className="text-sm wrap-long-words">{t('suggested', { line: row.suggestion })}</p>}
      <Link href={shopRoutes.incidents} className={detailLinkClass}>{t('openIncidents')}</Link>
    </>
  )
}

type DecisionDetailProps = {
  row: BoardRow
  text: RowText
  photoUrls: Readonly<Record<string, string>>
  passkeyNeeded: boolean
  // Beside the grid the heading takes the focus when a decision is opened; inside a phone's card the card has one.
  heading?: { readonly ref: Ref<HTMLHeadingElement> } | undefined
}

// Everything one decision needs: what it is, when it is due, who decides, the evidence, and what can be done here.
export function DecisionDetail({ row, text, photoUrls, passkeyNeeded, heading }: DecisionDetailProps) {
  const t = useTranslations('decisions.detail')
  return (
    <div className="grid min-w-0 gap-5">
      {heading === undefined ? null : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 ref={heading.ref} tabIndex={-1} className="text-[1.3125rem] leading-tight font-extrabold tracking-tight text-balance wrap-long-words focus:outline-none">
            {text.heading(row)}
          </h2>
          {row.simulated ? <SampleTag /> : null}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 @md:grid-cols-3">
        <Fact label={t('due')} value={text.due(row)} />
        {row.amountCents === null ? null : <Fact label={t('amount')} value={text.money(row.amountCents)} />}
        <Fact label={t('decider')} value={text.decider(row)} />
      </dl>
      <p className="font-semibold">{text.deciderLine(row)}</p>
      {row.waitingSince === null || row.kind === 'late' ? null : <p className="text-sm text-muted-foreground">{t('waiting', { when: text.moment(row.waitingSince) })}</p>}
      {row.kind === 'claim' || row.kind === 'contested' || row.kind === 'escalated' ? <ClaimDetail row={row} text={text} photoUrls={photoUrls} /> : null}
      {row.kind === 'proposal' ? <ProposalDetail row={row} text={text} passkeyNeeded={passkeyNeeded} /> : null}
      {row.kind === 'incident' ? <IncidentDetail row={row} /> : null}
      {row.kind === 'hold_ending' ? (
        <div className="grid gap-2">
          <p>{t('holdBody')}</p>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="relative h-1.5 max-w-64 flex-1 bg-muted">
              <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${String((row.day / HOLD_VALIDITY_DAYS) * 100)}%` }} />
            </span>
            <span className="figures text-xs">{text.subject(row)}</span>
          </div>
        </div>
      ) : null}
      {row.kind === 'late' ? <p>{t('lateBody', { when: text.moment(row.endsAt) })}</p> : null}
      {row.kind === 'dropped_off' ? <DropOffDetail row={row} text={text} photoUrls={photoUrls} /> : null}
      {row.kind === 'extension_payment' ? <ExtensionPaymentDetail row={row} text={text} /> : null}
      {row.rentalId === null ? null : <Link href={rentalRoutes.rental(row.rentalId)} className={detailLinkClass}>{t('openRental')}</Link>}
    </div>
  )
}
