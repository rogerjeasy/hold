'use client'

import { Camera } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import { startSelfReturn } from './renter-actions'

export function StartReturnForm({ token }: { token: string }) {
  const t = useTranslations('selfReturn.renter.intro')
  const locale = useLocale()
  const router = useRouter()
  const [result, start, pending] = useActionState(startSelfReturn, null)
  useEffect(() => {
    if (result?.ok === true) router.refresh()
  }, [result, router])
  return (
    <form action={start} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" className="min-h-12 justify-self-stretch sm:justify-self-start" disabled={pending}>
        <Camera aria-hidden="true" />
        {t('start')}
      </Button>
      <RenterMessage result={result} />
    </form>
  )
}
