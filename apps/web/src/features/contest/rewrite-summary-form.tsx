'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { rewriteContestSummary } from '@/features/claims/actions'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'

// Asks the model for a summary: again, when it could not write one, or for the first time, for a contest that has none,
// such as a sample's. Owners and managers decide contests. The page reads the new summary once it is stored.
export function RewriteSummaryForm({ rentalId, first }: { rentalId: string; first: boolean }) {
  const t = useTranslations('contest')
  const locale = useLocale()
  const router = useRouter()
  const [result, rewrite, pending] = useActionState(rewriteContestSummary, null)
  useEffect(() => {
    if (result?.ok === true) router.refresh()
  }, [result, router])
  return (
    <form action={rewrite} className="grid justify-items-start gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rentalId" value={rentalId} />
      <Button type="submit" variant="outline" disabled={pending}>{first ? t('write') : t('rewrite')}</Button>
      <ActionMessage result={result} success={t('rewritten')} results="contest.results" />
    </form>
  )
}
