import { CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
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
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid min-w-0 gap-8">
        <div className="grid max-w-prose gap-3">
          <p className="text-lg font-semibold text-pretty" data-testid="decisions-brief">
            {brief.decisions === 0 ? t('empty') : t('brief', brief)}
          </p>
          <p className="text-muted-foreground">{t('lead')}</p>
        </div>
        {moneyIsYours && gate.needed ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.decisions} body={t('passkeyBody')}>
            {null}
          </PasskeyGate>
        ) : null}
        {rows.length === 0 ? (
          <div className="flex max-w-prose gap-3 border bg-card p-5 text-card-foreground">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            <p className="text-muted-foreground">{t('emptyBody')}</p>
          </div>
        ) : (
          <DecisionBoard rows={rows} clock={clock} photoUrls={photoUrls} passkeyNeeded={gate.needed} />
        )}
      </div>
    </ShopFrame>
  )
}
