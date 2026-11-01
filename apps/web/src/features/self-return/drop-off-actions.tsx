'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { confirmDropOff, reportDropOffMissing } from './actions'

// Two plain choices after looking at the drop point. "It's here" makes the rental returned and opens the review, where a
// clean release or a claim is decided as at the counter. "It's not here" is recorded once; the hold stays.
export function DropOffActions({ rentalId, missing }: { rentalId: string; missing: boolean }) {
  const t = useTranslations('selfReturn.staff')
  const locale = useLocale()
  const router = useRouter()
  // Opened from the action itself: once the rental is returned, this card leaves the page it was on.
  const [confirmed, confirm, confirming] = useActionState(async (previous: unknown, data: FormData) => {
    const answer = await confirmDropOff(previous, data)
    if (answer.ok) router.push(rentalRoutes.claim(rentalId))
    return answer
  }, null)
  const [reported, report, reporting] = useActionState(reportDropOffMissing, null)
  useEffect(() => {
    if (reported?.ok === true) router.refresh()
  }, [reported, router])
  const busy = confirming || reporting
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={confirm} className="contents">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="rentalId" value={rentalId} />
          <Button type="submit" className="min-h-12 max-sm:w-full" disabled={busy}>{missing ? t('hereNow') : t('here')}</Button>
        </form>
        {missing ? null : (
          <form action={report} className="contents">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="rentalId" value={rentalId} />
            <Button type="submit" variant="outline" className="min-h-12 max-sm:w-full" disabled={busy}>{t('notHere')}</Button>
          </form>
        )}
      </div>
      {missing ? null : <p className="text-sm text-muted-foreground">{t('notHereBody')}</p>}
      <ActionMessage result={confirmed} success={t('confirmed')} results="selfReturn.staff.results" />
      <ActionMessage result={reported} success={reported?.ok === true && reported.value.sent !== null ? t('recordedTold') : t('recorded')} results="selfReturn.staff.results" />
    </div>
  )
}
