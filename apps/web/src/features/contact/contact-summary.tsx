'use client'
import { Mail, MessageSquare } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import type { RenterContactView } from './contact-view'
import { chooseEmail } from './renter-actions'

// How the renter is reached now, said plainly, with the one or two changes they can make from here.
export function ContactSummary({ token, contact, onChange }: { token: string; contact: RenterContactView; onChange: () => void }) {
  const t = useTranslations('contact')
  const locale = useLocale()
  const router = useRouter()
  const [chosen, choose, choosing] = useActionState(chooseEmail, null)
  useEffect(() => {
    if (chosen?.ok === true) router.refresh()
  }, [chosen, router])
  const texting = contact.channel === 'text' && contact.phone !== null
  const Icon = texting ? MessageSquare : Mail
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 font-semibold wrap-long-words">
          <Icon aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
          {texting ? t('byText', { phone: contact.phone }) : t('byEmail')}
        </p>
        {texting ? <span className="label shrink-0 border border-border-strong px-1.5 py-px text-[0.625rem] leading-normal text-muted-foreground">{contact.confirmed ? t('confirmed') : t('notConfirmed')}</span> : null}
      </div>
      <p className="max-w-prose text-pretty text-muted-foreground">{texting ? (contact.confirmed ? t('textBody') : t('notConfirmedBody')) : t('emailBody')}</p>
      <div className="flex flex-wrap gap-2">
        {texting ? (
          <>
            {contact.confirmed ? null : <Button type="button" onClick={onChange} className="min-h-12 whitespace-normal">{t('confirmNumber')}</Button>}
            <Button type="button" variant="outline" onClick={onChange} className="min-h-12 whitespace-normal">{t('changeNumber')}</Button>
            <form action={choose}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" disabled={choosing} className="min-h-12 whitespace-normal">{t('emailInstead')}</Button>
            </form>
          </>
        ) : (
          <Button type="button" onClick={onChange} className="min-h-12 whitespace-normal">
            <MessageSquare aria-hidden="true" />
            {t('textInstead')}
          </Button>
        )}
      </div>
      <RenterMessage result={chosen?.ok === true ? null : chosen} />
    </div>
  )
}
