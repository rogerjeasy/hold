'use client'

import { Mail, MessageSquare, QrCode } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { sendRenterLinkAgain, showRenterLink } from './actions'
import { LinkCode } from './link-code'

// walkIn: a walk-in still to approve the fee and the hold, together, in one PayPal approval. contact: how the renter is
// reached, by text to their masked number or by email, if at all (architecture.md section 12.3).
type LinkPanelProps = { rentalId: string; contact: { readonly channel: 'text' | 'email'; readonly to: string } | null; paid: boolean; walkIn?: boolean }

// The renter's link: a QR code to scan at the counter, the address to copy, or sent the way the renter is reached. Each
// shows a new link, since only a link's fingerprint is kept and an earlier one cannot be shown again.
export function LinkPanel({ rentalId, contact, paid, walkIn = false }: LinkPanelProps) {
  const t = useTranslations('shop.rentals.link')
  const locale = useLocale()
  const [shown, show, showing] = useActionState(showRenterLink, null)
  const [sent, send, sending] = useActionState(sendRenterLinkAgain, null)
  const Icon = contact?.channel === 'text' ? MessageSquare : Mail

  return (
    <Panel title={t('title')}>
      <div className="grid gap-4 px-4 py-4 md:px-5">
        <p className="text-muted-foreground">{paid ? t('paid') : walkIn ? t('walkIn') : t('body')}</p>
        <div className="flex flex-wrap gap-2">
          <form action={show}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="rentalId" value={rentalId} />
            <Button type="submit" disabled={showing}>
              <QrCode aria-hidden="true" />
              {showing ? t('showing') : t('show')}
            </Button>
          </form>
          {contact === null ? null : (
            <form action={send} className="max-w-full min-w-0">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="rentalId" value={rentalId} />
              {/* An email address can be long, so the button wraps rather than widening the page. */}
              <Button type="submit" variant="outline" disabled={sending} className="h-auto max-w-full min-w-0 shrink py-2 text-left whitespace-normal wrap-anywhere">
                <Icon aria-hidden="true" />
                {sending ? t('emailing') : contact.channel === 'text' ? t('text', { phone: contact.to }) : t('email', { email: contact.to })}
              </Button>
            </form>
          )}
        </div>
        {shown?.ok === true ? (
          <LinkCode url={shown.value.url} qr={shown.value.qr} scan={t('scan')} />
        ) : (
          <ActionMessage result={shown} success="" results="shop.rentals.results" />
        )}
        <ActionMessage result={sent} success={sent?.ok === true ? (sent.value.via === 'text' ? t('texted', { phone: sent.value.to }) : t('emailed', { email: sent.value.to })) : ''} results="shop.rentals.results" />
      </div>
    </Panel>
  )
}
