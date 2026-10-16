'use client'

import { Mail, QrCode } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { emailRenterLinkAgain, showRenterLink } from './actions'
import { LinkCode } from './link-code'

type LinkPanelProps = { rentalId: string; contactEmail: string | null; paid: boolean }

// The renter's link: a QR code to scan at the counter, the address to copy, or an email. Each shows a new link, since
// only a link's fingerprint is kept and an earlier one cannot be shown again.
export function LinkPanel({ rentalId, contactEmail, paid }: LinkPanelProps) {
  const t = useTranslations('shop.rentals.link')
  const locale = useLocale()
  const [shown, show, showing] = useActionState(showRenterLink, null)
  const [emailed, email, emailing] = useActionState(emailRenterLinkAgain, null)

  return (
    <Panel title={t('title')}>
      <div className="grid gap-4 px-4 py-4 md:px-5">
        <p className="text-muted-foreground">{paid ? t('paid') : t('body')}</p>
        <div className="flex flex-wrap gap-2">
          <form action={show}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="rentalId" value={rentalId} />
            <Button type="submit" disabled={showing}>
              <QrCode aria-hidden="true" />
              {showing ? t('showing') : t('show')}
            </Button>
          </form>
          {contactEmail === null ? null : (
            <form action={email} className="max-w-full min-w-0">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="rentalId" value={rentalId} />
              {/* An email address can be long, so the button wraps rather than widening the page. */}
              <Button type="submit" variant="outline" disabled={emailing} className="h-auto max-w-full min-w-0 shrink py-2 text-left whitespace-normal wrap-anywhere">
                <Mail aria-hidden="true" />
                {emailing ? t('emailing') : t('email', { email: contactEmail })}
              </Button>
            </form>
          )}
        </div>
        {shown?.ok === true ? (
          <LinkCode url={shown.value.url} qr={shown.value.qr} scan={t('scan')} />
        ) : (
          <ActionMessage result={shown} success="" results="shop.rentals.results" />
        )}
        <ActionMessage result={emailed} success={emailed?.ok === true ? t('emailed', { email: emailed.value.email }) : ''} results="shop.rentals.results" />
      </div>
    </Panel>
  )
}
