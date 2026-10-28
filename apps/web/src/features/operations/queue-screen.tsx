import type { QueueEntry } from '@hold/db'
import type { Mandate } from '@hold/domain'
import { proposalMovesMoney, queueBrief } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { shopRoutes } from '@/lib/routes'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import { CheckNowForm } from './check-now-form'
import { QueueGroups } from './queue-groups'
import { RecentDecisions } from './recent-decisions'
import type { RecentDecision } from './recent-decisions'
import { RulesSection } from './rules-section'
import type { RuleRow } from './rules-section'
import { StandingRuleSection } from './standing-rule-section'

export type QueueScreenProps = {
  shopName: string
  clock: ShopClock
  // When the shop's own day ends, for "expires today".
  endOfDay: Date
  entries: readonly QueueEntry[]
  recent: readonly RecentDecision[]
  rules: readonly RuleRow[]
  standingRule: Mandate | undefined
  canDecide: boolean
  isOwner: boolean
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

// The morning queue (extensions.md section 6.3): one sentence, then each entry grouped by kind with what will happen,
// why, the amount from the records and its PayPal references. Then what was decided lately, the rules learned from
// rejections and the standing rule.
export function QueueScreen({ shopName, clock, endOfDay, entries, recent, rules, standingRule, canDecide, isOwner, gate }: QueueScreenProps) {
  const t = useTranslations('operations')
  const brief = queueBrief(entries, endOfDay)
  const moneyWaits = entries.some((entry) => proposalMovesMoney(entry.kind))
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-5xl gap-10">
        <div className="grid gap-4">
          <p className="text-lg font-semibold text-pretty" data-testid="queue-brief">
            {brief.decisions === 0 ? t('briefNone') : t('brief', { decisions: brief.decisions, expiring: brief.expiringToday })}
          </p>
          <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
          {canDecide ? <CheckNowForm /> : <p className="text-muted-foreground">{t('readOnly')}</p>}
        </div>
        {canDecide && moneyWaits && gate.needed ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.queue} body={t('passkeyBody')}>
            {null}
          </PasskeyGate>
        ) : null}
        {entries.length === 0 ? <p>{t('empty')}</p> : <QueueGroups entries={entries} clock={clock} canDecide={canDecide} passkeyNeeded={gate.needed} />}
        <RecentDecisions recent={recent} clock={clock} />
        <RulesSection rules={rules} clock={clock} isOwner={isOwner} />
        <StandingRuleSection standingRule={standingRule} clock={clock} isOwner={isOwner} gate={gate} />
      </div>
    </ShopFrame>
  )
}
