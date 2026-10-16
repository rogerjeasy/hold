'use client'

import type { RentalHandover } from '@hold/db'
import { Camera, CircleCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionMessage } from '@/features/shop/action-message'
import { Link, useRouter } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { startHandover } from './actions'

// The handover on the rental's page (architecture.md section 11.2): each item photographed view by view and sealed.
// Once every item is sealed, the rental is out.
export function HandoverPanel({ rentalId, handovers }: { rentalId: string; handovers: readonly RentalHandover[] }) {
  const t = useTranslations('shop.handover')
  const locale = useLocale()
  const router = useRouter()
  const [started, start, starting] = useActionState(startHandover, null)
  useEffect(() => {
    if (started?.ok === true) router.push(rentalRoutes.handover(rentalId, started.value.sessionId))
  }, [started, rentalId, router])
  return (
    <Panel title={t('title')}>
      <div className="grid gap-3 px-4 py-4 md:px-5">
        <p className="text-muted-foreground">{t('body')}</p>
        <ul className="grid gap-2">
          {handovers.map((handover) => (
            <li key={handover.itemId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-2 first:border-t-0 first:pt-0">
              <span className="min-w-0 font-semibold wrap-long-words">{handover.label}</span>
              {handover.sealed ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {t('sealed')}
                </span>
              ) : handover.sessionId !== null ? (
                <Button asChild variant="outline">
                  <Link href={rentalRoutes.handover(rentalId, handover.sessionId)} aria-label={t('continueItem', { item: handover.label })}>
                    {t('continue')}
                  </Link>
                </Button>
              ) : (
                <form action={start}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="rentalId" value={rentalId} />
                  <input type="hidden" name="itemId" value={handover.itemId} />
                  <Button type="submit" disabled={starting} aria-label={t('startItem', { item: handover.label })}>
                    <Camera aria-hidden="true" />
                    {t('start')}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <ActionMessage result={started?.ok === true ? null : started} success="" results="shop.handover.results" />
      </div>
    </Panel>
  )
}
