'use client'

import { CircleCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { disconnectAssistant } from './renter-actions'

// Revokes the assistant's token. Its very next call is refused; the renter's own link keeps working.
export function DisconnectForm({ token }: { token: string }) {
  const t = useTranslations('renter.assistant')
  const locale = useLocale()
  const [result, disconnect, pending] = useActionState(disconnectAssistant, null)
  if (result?.ok === true) {
    return (
      <p role="status" className="flex items-start gap-2 font-semibold">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
        {t('disconnected')}
      </p>
    )
  }
  return (
    <form action={disconnect} className="grid justify-items-start gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <p className="max-w-prose text-muted-foreground">{t('disconnectLead')}</p>
      <Button type="submit" variant="outline" className="min-h-12" disabled={pending}>
        {pending ? t('disconnecting') : t('disconnect')}
      </Button>
      <RenterMessage result={result} wording={{ not_connected: t('notConnected') }} />
    </form>
  )
}
