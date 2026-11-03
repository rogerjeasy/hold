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
import { SampleInvestigationSection } from './sample-investigation-section'
import type { SampleInvestigation } from './sample-investigation-section'
import type { RuleRow } from './rules-section'
import { StandingRuleSection } from './standing-rule-section'
import { DropOffsSection } from '@/features/self-return/drop-offs-section'
import type { DropOffEntry } from '@/features/self-return/drop-off-card'

const NO_SAMPLES: SampleInvestigation = { waiting: 0, status: undefined }

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
  // Items renters returned with nobody at the counter (architecture.md section 6.13), which counter staff check too.
  dropOffs?: readonly DropOffEntry[]
  canCheck?: boolean
  // A demo's sample entries no model has looked at, and the last investigation of them (extensions.md section 6.14).
  samples?: SampleInvestigation
  isOwner: boolean
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

// The morning queue (extensions.md section 6.3): one sentence, then each entry grouped by kind with what will happen,
// why, the amount from the records and its PayPal references. Then what was decided lately, the rules learned from
// rejections and the standing rule.
export function QueueScreen({ shopName, clock, endOfDay, entries, recent, rules, standingRule, canDecide, dropOffs = [], canCheck = false, samples = NO_SAMPLES, isOwner, gate }: QueueScreenProps) {
  const t = useTranslations('operations')
  const brief = queueBrief(entries, endOfDay)
  const moneyWaits = entries.some((entry) => proposalMovesMoney(entry.kind))
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-5xl gap-10">
        <DropOffsSection dropOffs={dropOffs} clock={clock} canAct={canCheck} />
        <div className="grid gap-4">
          <p className="text-lg font-semibold text-pretty" data-testid="queue-brief">
            {brief.decisions === 0 ? t('briefNone') : t('brief', { decisions: brief.decisions, expiring: brief.expiringToday })}
          </p>
          <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
          {canDecide ? <CheckNowForm /> : <p className="text-muted-foreground">{t('readOnly')}</p>}
        </div>
        {canDecide && (samples.waiting > 0 || samples.status !== undefined) ? <SampleInvestigationSection samples={samples} clock={clock} /> : null}
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
