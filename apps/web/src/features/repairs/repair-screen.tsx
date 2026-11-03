'use client'
import type { ItemRepair } from '@hold/db'
import { useTranslations } from 'next-intl'
import { BackLink } from '@/components/ui/back-link'
import { Notice } from '@/components/ui/notice'
import type { HandoverView } from '@/features/handover/handover-screen'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useLookAgain } from '@/hooks/use-look-again'
import { itemRoutes } from '@/lib/routes'
import { FinishRepairForm } from './finish-repair-form'
import { RepairCapture } from './repair-capture'
import type { RepairGuide } from './repair-capture'
import { RepairDone } from './repair-done'

type Props = { shopName: string; itemId: string; itemLabel: string; clock: ShopClock; repair: ItemRepair; session: HandoverView | null; guides: readonly RepairGuide[]; canAct: boolean }

// One repair (architecture.md section 9.6): the marked views photographed against where each mark was, then what was
// done and what it cost. Closed, it shows what it came to.
export function RepairScreen({ shopName, itemId, itemLabel, clock, repair, session, guides, canAct }: Props) {
  const t = useTranslations('repairs.page')
  useLookAgain(session?.photos.some((photo) => photo.url === null) ?? false)
  const open = repair.state === 'open'
  return (
    <ShopFrame shopName={shopName} title={itemLabel} description={open ? t('lead') : undefined} actions={<BackLink href={itemRoutes.item(itemId)}>{t('back')}</BackLink>}>
      <div className="grid gap-6">
        {session?.photos.some((photo) => photo.simulated) === true ? <Notice title={t('sampleTitle')} body={t('sampleBody')} /> : null}
        {session === null ? (open ? <p>{t('nothingToPhotograph')}</p> : null) : <RepairCapture session={session} guides={guides} canAct={canAct && open} />}
        {open ? (canAct && clock.currency !== null ? <FinishRepairForm repair={repair} currency={clock.currency} photographsMissing={session !== null && session.missing.length > 0} /> : null) : <RepairDone repair={repair} clock={clock} />}
      </div>
    </ShopFrame>
  )
}
