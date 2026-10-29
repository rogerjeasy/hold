'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { checkExtensionPayment } from '@/features/extension/actions'
import { ActionMessage } from '@/features/shop/action-message'
import { useRouter } from '@/i18n/navigation'

// Says a person looked at the payment in PayPal; the board reads again without it.
export function CheckPaymentForm({ extensionId }: { extensionId: string }) {
  const t = useTranslations('decisions.detail.extensionPayment')
  const locale = useLocale()
  const router = useRouter()
  const [result, check, pending] = useActionState(checkExtensionPayment, null)
  useEffect(() => {
    if (result?.ok === true) router.refresh()
  }, [result, router])
  return (
    <form action={check} className="grid justify-items-start gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="extensionId" value={extensionId} />
      <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>{t('check')}</Button>
      <ActionMessage result={result} success={t('checked')} results="decisions.detail.extensionPayment.results" />
    </form>
  )
}
