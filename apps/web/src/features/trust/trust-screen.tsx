import type { LedgerLine, PublishedTrustLadder } from '@hold/db'
import { useTranslations } from 'next-intl'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import { shopRoutes } from '@/lib/routes'
import { CurrentLadder } from './current-ladder'
import { ladderDraft } from './ladder-draft'
import { LadderEditor } from './ladder-editor'
import { TrustLedger } from './trust-ledger'

export type TrustScreenProps = {
  shopName: string
  timeZone: string
  current: PublishedTrustLadder | undefined
  // The shop's currency, set by its first price list. Without it there is nothing to publish yet.
  currency: string | null
  canPublish: boolean
  gate: { needed: boolean; hasPasskey: boolean; email: string }
  ledger: readonly LedgerLine[]
}

// The shop's trust ladder (extensions.md section 7.5): the version in force, the owner's editor with its replay over
// past rentals, and the trust ledger. Everyone in the shop sees the ladder; only the owner publishes one.
export function TrustScreen({ shopName, timeZone, current, currency, canPublish, gate, ledger }: TrustScreenProps) {
  const t = useTranslations('trust.ladder')
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-4xl gap-10">
        <p className="max-w-prose text-pretty">{t('lead')}</p>
        <CurrentLadder current={current} />
        {canPublish && currency !== null ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.trust}>
            <LadderEditor draft={ladderDraft(current?.ladder)} currency={currency} />
          </PasskeyGate>
        ) : (
          <p className="text-muted-foreground">{canPublish ? t('results.currency_unset') : t('readOnly')}</p>
        )}
        <TrustLedger ledger={ledger} timeZone={timeZone} />
      </div>
    </ShopFrame>
  )
}
