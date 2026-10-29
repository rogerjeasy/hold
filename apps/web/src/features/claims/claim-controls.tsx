'use client'
import type { ClaimWorkspace } from '@hold/db'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { LinkCode } from '@/features/rentals/link-code'
import { approveAndPresent, confirmClean, decide } from './actions'

export function CleanReleaseForm({ rentalId }: { rentalId: string }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const [result, release, pending] = useActionState(confirmClean, null)
  return <form action={release} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="rentalId" value={rentalId} />
    <p>{t('cleanGuidance')}</p><Label htmlFor="clean-reason">{t('inspectionReason')}</Label><Textarea id="clean-reason" name="reason" required maxLength={1000} />
    <Button type="submit" disabled={pending} className="min-h-12 w-full whitespace-normal sm:w-auto sm:justify-self-start">{t('cleanRelease')}</Button><ActionMessage result={result} success={t('releaseQueued')} results="claim.results" />
  </form>
}
export function ApproveClaimForm({ claimId }: { claimId: string }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const [result, approve, pending] = useActionState(approveAndPresent, null)
  return <div className="grid gap-4"><form action={approve} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="claimId" value={claimId} />
    <p>{t('approveGuidance')}</p><Button type="submit" disabled={pending} className="min-h-12 w-full whitespace-normal sm:w-auto sm:justify-self-start">{t('approve')}</Button><ActionMessage result={result} success={t('approved')} results="claim.results" />
  </form>{result?.ok === true ? <LinkCode url={result.value.url} qr={result.value.qr} scan={t('scan')} /> : null}</div>
}
export function DecideClaimForm({ claim, reasonShownToRenter = false }: { claim: NonNullable<ClaimWorkspace['claim']>; reasonShownToRenter?: boolean }) {
  const t = useTranslations('claim'); const locale = useLocale()
  const promise = useTranslations('promise.shop')
  const [result, act, pending] = useActionState(decide, null)
  return <form action={act} className="grid gap-3"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="claimId" value={claim.id} />
    <Label htmlFor="decision-reason">{t('decisionReason')}</Label><Textarea id="decision-reason" name="reason" required maxLength={1000} /><p className="text-muted-foreground">{reasonShownToRenter ? promise('reasonShown') : t('decisionGuidance')}</p>
    <div className="flex flex-wrap gap-3">{(['contested', 'escalated', 'charging', 'charged', 'charge_failed'].includes(claim.state)) ? <Button name="decision" value="uphold" disabled={pending} className="min-h-12 whitespace-normal">{t('uphold')}</Button> : null}<Button name="decision" value="waive" variant="outline" disabled={pending} className="min-h-12 whitespace-normal">{t('waive')}</Button></div><ActionMessage result={result} success={t('decisionRecorded')} results="claim.results" />
  </form>
}
