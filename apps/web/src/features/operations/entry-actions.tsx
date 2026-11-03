'use client'

import { proposalMovesMoney } from '@hold/domain'
import type { ProposalKind } from '@hold/domain'
import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { approveProposals, postponeProposal, rejectProposal } from './actions'
import { ApprovalMessage } from './approval-message'

type EntryActionsProps = { proposalId: string; kind: ProposalKind; passkeyNeeded: boolean; together: string | undefined }

// Approve, reject with a reason, or postpone one entry. What moves money waits for the passkey; the server checks
// the same again. A release may also be chosen for approving several together.
export function EntryActions({ proposalId, kind, passkeyNeeded, together }: EntryActionsProps) {
  const t = useTranslations('operations')
  const locale = useLocale()
  const reasonId = useId()
  const [approval, approve, approving] = useActionState(approveProposals, null)
  const [rejection, reject, rejecting] = useActionState(rejectProposal, null)
  const [postponement, postpone, postponing] = useActionState(postponeProposal, null)
  const fields = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="proposalId" value={proposalId} />
    </>
  )
  return (
    <div className="grid gap-3 border-t border-border/70 pt-4">
      {together === undefined ? null : (
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-muted/50 px-3">
          <input type="checkbox" name="proposalId" value={proposalId} form={together} className="min-h-11 min-w-11 shrink-0 accent-primary" />
          <span>{t('chooseRelease')}</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {proposalMovesMoney(kind) && passkeyNeeded ? (
          <p className="text-sm text-muted-foreground">{t('approveNeedsPasskey')}</p>
        ) : (
          <form action={approve}>
            {fields}
            <Button type="submit" disabled={approving}>{t('approve')}</Button>
          </form>
        )}
        <form action={postpone}>
          {fields}
          <Button type="submit" variant="outline" disabled={postponing} className="whitespace-normal">{t('postpone')}</Button>
        </form>
      </div>
      <ApprovalMessage result={approval} success={t('approved')} />
      <ActionMessage result={postponement} success={t('postponed')} results="operations.results" />
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 font-medium text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground [&::-webkit-details-marker]:hidden">{t('reject')}<ChevronDown aria-hidden="true" className="size-4 transition-transform duration-300 ease-spring group-open:rotate-180" /></summary>
        <form action={reject} className="mt-2 grid animate-fade gap-2 rounded-xl border border-border/70 bg-muted/30 p-3.5">
          {fields}
          <Label htmlFor={reasonId}>{t('rejectReason')}</Label>
          <Textarea id={reasonId} name="reason" required maxLength={500} className="min-h-24" />
          <Button type="submit" variant="outline" disabled={rejecting} className="justify-self-start">{t('rejectSubmit')}</Button>
        </form>
      </details>
      <ActionMessage result={rejection} success={t('rejected')} results="operations.results" />
    </div>
  )
}
