'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ActionMessage } from '@/features/shop/action-message'
import { recordReview } from './actions'
import { reviewNote } from './review-input'

export function ReviewForm({ comparisonId }: { comparisonId: string }) {
  const t = useTranslations('shop.comparison')
  const locale = useLocale()
  const [result, record, pending] = useActionState(recordReview, null)
  return <form action={record} className="grid max-w-prose gap-3">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="comparisonId" value={comparisonId} />
    <Label htmlFor="inspection-outcome">{t('yourOutcome')}</Label>
    <Select id="inspection-outcome" name="outcome" defaultValue="deferred">{reviewNote.shape.outcome.options.map((outcome) => <option key={outcome} value={outcome}>{t(`outcomes.${outcome}`)}</option>)}</Select>
    <Label htmlFor="inspection-reason">{t('notes')}</Label>
    <Textarea id="inspection-reason" name="reason" required maxLength={1000} />
    <p className="text-sm text-pretty text-muted-foreground">{t('noteBoundary')}</p>
    <Button type="submit" disabled={pending} className="max-sm:w-full sm:justify-self-start">{t('record')}</Button>
    <ActionMessage result={result} success={t('recorded')} results="shop.returns.results" />
  </form>
}
