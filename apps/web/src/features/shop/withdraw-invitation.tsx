'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { ActionMessage } from './action-message'
import { withdrawInvitation } from './actions'

export function WithdrawInvitation({ invitationId, email }: { invitationId: string; email: string }) {
  const t = useTranslations('shop.staff.open')
  const locale = useLocale()
  const [result, withdraw, pending] = useActionState(withdrawInvitation, null)

  return (
    <form action={withdraw} className="grid gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" disabled={pending} className="hover:bg-destructive/10 hover:text-destructive" aria-label={t('withdrawFor', { email })}>
        {t('withdraw')}
      </Button>
      <ActionMessage result={result} success={t('withdrawn')} />
    </form>
  )
}
