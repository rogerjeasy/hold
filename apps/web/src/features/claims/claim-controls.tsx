'use client'
import type { ClaimWorkspace } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { LinkCode } from '@/features/rentals/link-code'
import { approveAndPresent, confirmClean, decide } from './actions'

// quiet: the comparison found possible new damage, so releasing the hold is the path less taken. It asks first, behind
// an outline button, and never looks like the page's main action (audit finding F-M10).
export function CleanReleaseForm({ rentalId, quiet = false }: { rentalId: string; quiet?: boolean }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const [result, release, pending] = useActionState(confirmClean, null)
  const [asked, setAsked] = useState(!quiet)
  if (!asked) {
    return <div className="grid gap-3">
      <p className="text-pretty text-muted-foreground">{t('cleanAnyway')}</p>
      <Button type="button" variant="outline" className="max-sm:w-full sm:justify-self-start" onClick={() => { setAsked(true) }}>{t('releaseAnyway')}</Button>
    </div>
  }
  return <form action={release} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={rentalId} />
    <p className="text-pretty">{t('cleanGuidance')}</p><Label htmlFor="clean-reason">{t('inspectionReason')}</Label><Textarea id="clean-reason" name="reason" required maxLength={1000} />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant={quiet ? 'outline' : 'default'} disabled={pending} className="max-sm:w-full">{t('cleanRelease')}</Button>
      {quiet ? <Button type="button" variant="ghost" className="max-sm:w-full" onClick={() => { setAsked(false) }}>{t('keepHold')}</Button> : null}
    </div>
    <ActionMessage result={result} success={t('releaseQueued')} results="claim.results" />
  </form>
}
export function ApproveClaimForm({ claimId }: { claimId: string }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const [result, approve, pending] = useActionState(approveAndPresent, null)
  return <div className="grid gap-4"><form action={approve} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="claimId" value={claimId} />
    <p className="text-pretty">{t('approveGuidance')}</p><Button type="submit" disabled={pending} className="max-sm:w-full sm:justify-self-start">{t('approve')}</Button><ActionMessage result={result} success={t('approved')} results="claim.results" />
  </form>{result?.ok === true ? <LinkCode url={result.value.url} qr={result.value.qr} scan={t('scan')} /> : null}</div>
}
export function DecideClaimForm({ claim, reasonShownToRenter = false }: { claim: NonNullable<ClaimWorkspace['claim']>; reasonShownToRenter?: boolean }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const promise = useTranslations('promise.shop')
  const [result, act, pending] = useActionState(decide, null)
  const upholding = ['contested', 'escalated', 'charging', 'charged', 'charge_failed'].includes(claim.state)
  return <form action={act} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="claimId" value={claim.id} />
    <Label htmlFor="decision-reason">{t('decisionReason')}</Label><Textarea id="decision-reason" name="reason" required maxLength={1000} /><p className="text-pretty text-muted-foreground">{reasonShownToRenter ? promise('reasonShown') : t('decisionGuidance')}</p>
    <div className="flex flex-wrap gap-2">{upholding ? <Button name="decision" value="uphold" disabled={pending} className="max-sm:w-full">{t('uphold')}</Button> : null}<Button name="decision" value="waive" variant="outline" disabled={pending} className="max-sm:w-full">{t('waive')}</Button></div><ActionMessage result={result} success={t('decisionRecorded')} results="claim.results" />
  </form>
}
