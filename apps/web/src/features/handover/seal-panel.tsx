'use client'

import { CircleCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { LinkCode } from '@/features/rentals/link-code'
import { ActionMessage } from '@/features/shop/action-message'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { sealHandover } from './actions'

// Sealing fixes the item's photographs and chains them to its history (architecture.md section 9.2). When the last
// item is sealed, the rental is out and the renter's condition report is shown as a code.
export function SealPanel({ sessionId, rentalId, missing, sealed: alreadySealed }: { sessionId: string; rentalId: string; missing: readonly string[]; sealed: boolean }) {
  const t = useTranslations('shop.handover.seal')
  const locale = useLocale()
  const [sealed, seal, sealing] = useActionState(sealHandover, null)
  if (sealed?.ok === true) {
    return (
      <div className="grid gap-3">
        <p role="status" className="flex items-center gap-2 font-semibold">
          <CircleCheck aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
          {sealed.value.rentalOut ? t('out') : t('next')}
        </p>
        {sealed.value.conditionLink === undefined ? null : (
          <>
            <p className="text-muted-foreground">{sealed.value.conditionLink.emailed ? t('emailed') : t('show')}</p>
            <LinkCode url={sealed.value.conditionLink.url} qr={sealed.value.conditionLink.qr} scan={t('scan')} />
          </>
        )}
        <Link href={rentalRoutes.rental(rentalId)} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t('back')}
        </Link>
      </div>
    )
  }
  if (alreadySealed) return <p className="font-semibold">{t('sealedNote')}</p>
  return (
    <form action={seal} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="text-muted-foreground">{missing.length === 0 ? t('ready') : t('missing', { count: missing.length })}</p>
      <Button type="submit" className="min-h-12 justify-self-start" disabled={sealing || missing.length > 0}>
        {t('seal')}
      </Button>
      <ActionMessage result={sealed} success="" results="shop.handover.results" />
    </form>
  )
}
