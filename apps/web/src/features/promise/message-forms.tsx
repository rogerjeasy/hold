'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RenterMessage } from '@/features/renter/renter-message'
import { ActionMessage } from '@/features/shop/action-message'
import { writeToRenter } from './actions'
import { writeToShop } from './renter-actions'

const MESSAGE_LIMIT = 1000

export function RenterMessageForm({ token }: { token: string }) {
  const t = useTranslations('promise')
  const locale = useLocale()
  const id = useId()
  const [result, send, sending] = useActionState(writeToShop, null)
  const wording = Object.fromEntries(['message_invalid', 'rate_limited', 'not_found'].map((key) => [key, t(`results.${key}` as Parameters<typeof t>[0])]))
  return (
    <form action={send} className="grid gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Label htmlFor={id}>{t('messages.writeRenter')}</Label>
      <Textarea id={id} name="body" required maxLength={MESSAGE_LIMIT} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('messages.renterHint')}</p>
      <Button type="submit" variant="outline" disabled={sending} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('messages.send')}</Button>
      {result?.ok === true ? <p role="status">{t('messages.sent')}</p> : <RenterMessage result={result} wording={wording} />}
    </form>
  )
}

export function ShopMessageForm({ rentalId, renterName }: { rentalId: string; renterName: string }) {
  const t = useTranslations('promise.messages')
  const locale = useLocale()
  const id = useId()
  const [result, send, sending] = useActionState(writeToRenter, null)
  return (
    <form action={send} className="grid gap-2">
      <input type="hidden" name="rentalId" value={rentalId} />
      <input type="hidden" name="locale" value={locale} />
      <Label htmlFor={id}>{t('writeShop', { renter: renterName })}</Label>
      <Textarea id={id} name="body" required maxLength={MESSAGE_LIMIT} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('shopHint', { renter: renterName })}</p>
      <Button type="submit" variant="outline" disabled={sending} className="min-h-12 justify-self-stretch sm:justify-self-start">{t('send')}</Button>
      <ActionMessage result={result} success={t('sent')} results="promise.results" />
    </form>
  )
}
