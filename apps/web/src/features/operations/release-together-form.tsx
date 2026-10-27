'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { approveProposals } from './actions'
import { ApprovalMessage } from './approval-message'
import { RELEASE_TOGETHER_FORM } from './release-together'

// Approves the releases chosen in their cards, in one tap. Nothing but releases can be approved together.
export function ReleaseTogetherForm() {
  const t = useTranslations('operations')
  const locale = useLocale()
  const [result, approve, pending] = useActionState(approveProposals, null)
  return (
    <form id={RELEASE_TOGETHER_FORM} action={approve} className="grid justify-items-start gap-2">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" disabled={pending} className="whitespace-normal">{t('approveTogether')}</Button>
      <ApprovalMessage result={result} success={t('approvedTogether')} />
    </form>
  )
}
