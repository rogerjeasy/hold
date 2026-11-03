'use client'

import { RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from '@/features/shop/action-message'
import { checkNow } from './actions'

// Asks for the same check the night runs, now. The page shows what it found once it is done.
export function CheckNowForm() {
  const t = useTranslations('operations')
  const locale = useLocale()
  const [result, check, pending] = useActionState(checkNow, null)
  return (
    <form action={check} className="grid justify-items-start gap-2 md:max-w-64 md:justify-items-end md:text-right">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" disabled={pending}>
        <RefreshCw aria-hidden="true" className={pending ? 'animate-spin motion-reduce:animate-none' : undefined} />
        {pending ? t('checking') : t('checkNow')}
      </Button>
      <p className="text-sm text-muted-foreground">{t('checkNote')}</p>
      <ActionMessage result={result} success={t('checked')} results="operations.results" />
    </form>
  )
}
