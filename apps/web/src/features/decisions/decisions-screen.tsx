import { CircleCheck, Inbox } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { EmptyState } from '@/components/ui/empty-state'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import { shopRoutes } from '@/lib/routes'
import { boardBrief } from './board'
import type { BoardRow } from './board'
import { DecisionBoard } from './decision-board'

export type DecisionsScreenProps = {
  shopName: string
  clock: ShopClock
  // When the shop's own day ends, for "falls due today".
  endOfDay: Date
  rows: readonly BoardRow[]
  photoUrls: Readonly<Record<string, string>>
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

// The decision board (extensions.md section 12.5): one sentence on what waits and how much of it is the viewer's,
// then the board. The passkey is offered up front when the viewer may approve something that moves money here.
export function DecisionsScreen({ shopName, clock, endOfDay, rows, photoUrls, gate }: DecisionsScreenProps) {
  const t = useTranslations('decisions')
  const brief = boardBrief(rows, endOfDay)
  const moneyIsYours = rows.some((row) => row.kind === 'proposal' && row.movesMoney && row.decider === 'you')
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      <div className="grid min-w-0 gap-8">
        <div className="surface flex min-w-0 items-center gap-3.5 p-4 md:px-5">
          <span aria-hidden="true" className={brief.decisions === 0 ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success' : 'grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'}>
            {brief.decisions === 0 ? <CircleCheck className="size-5" /> : <Inbox className="size-5" />}
          </span>
          <p className="min-w-0 text-[1.0625rem] font-semibold text-pretty wrap-long-words" data-testid="decisions-brief">
            {brief.decisions === 0 ? t('empty') : t('brief', brief)}
          </p>
        </div>
        {moneyIsYours && gate.needed ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.decisions} body={t('passkeyBody')}>
            {null}
          </PasskeyGate>
        ) : null}
        {rows.length === 0 ? (
          <div className="surface overflow-clip">
            <EmptyState icon={CircleCheck} title={t('allClear')} body={t('emptyBody')} />
          </div>
        ) : (
          <DecisionBoard rows={rows} clock={clock} photoUrls={photoUrls} passkeyNeeded={gate.needed} />
        )}
      </div>
    </ShopFrame>
  )
}
