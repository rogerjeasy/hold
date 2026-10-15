'use client'

import { Copy, Mail, QrCode } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { emailRenterLinkAgain, showRenterLink } from './actions'

type LinkPanelProps = { rentalId: string; contactEmail: string | null; paid: boolean }

// The renter's link: a QR code to scan at the counter, the address to copy, or an email. Each shows a new link, since
// only a link's fingerprint is kept and an earlier one cannot be shown again.
export function LinkPanel({ rentalId, contactEmail, paid }: LinkPanelProps) {
  const t = useTranslations('shop.rentals.link')
  const locale = useLocale()
  const [shown, show, showing] = useActionState(showRenterLink, null)
  const [emailed, email, emailing] = useActionState(emailRenterLinkAgain, null)
  const [copied, setCopied] = useState(false)

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
          <figure className="grid justify-items-start gap-3">
            {/* The SVG is drawn on the server from the link alone (server/qr.ts). */}
            <div role="img" aria-label={t('scan')} className="size-56 border bg-white p-2" dangerouslySetInnerHTML={{ __html: shown.value.qr }} />
            <figcaption className="text-sm text-muted-foreground">{t('scan')}</figcaption>
            <p data-testid="renter-link" className="figures max-w-full text-sm break-all">
              {shown.value.url}
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(shown.value.url).then(() => {
                  setCopied(true)
                })
              }}
            >
              <Copy aria-hidden="true" />
              {copied ? t('copied') : t('copy')}
            </Button>
          </figure>
        ) : (
          <ActionMessage result={shown} success="" results="shop.rentals.results" />
        )}
        <ActionMessage result={emailed} success={emailed?.ok === true ? t('emailed', { email: emailed.value.email }) : ''} results="shop.rentals.results" />
      </div>
    </Panel>
  )
}
