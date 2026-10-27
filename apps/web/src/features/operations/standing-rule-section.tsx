import type { Mandate } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { shopRoutes } from '@/lib/routes'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import { GrantStandingRuleForm, RevokeStandingRuleForm } from './standing-rule-forms'

type StandingRuleSectionProps = { standingRule: Mandate | undefined; clock: ShopClock; isOwner: boolean; gate: { needed: boolean; hasPasskey: boolean; email: string } }

// The one standing rule offered (extensions.md section 6.4): whether it is on, until when and for how many releases a
// day. The owner turns it on with a passkey, and off at any time.
export function StandingRuleSection({ standingRule, clock, isOwner, gate }: StandingRuleSectionProps) {
  const t = useTranslations('operations.standing')
  const format = useShopFormat(clock)
  const limits = standingRule?.limits
  const dailyCount = limits !== undefined && 'dailyCount' in limits ? Number(limits.dailyCount) : 0
  return (
    <section aria-labelledby="standing-rule" className="grid min-w-0 gap-3">
      <h2 id="standing-rule" className="text-[1.1875rem] font-extrabold tracking-tight">{t('title')}</h2>
      <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
      <p className="font-semibold" data-testid="standing-rule-state">
        {standingRule === undefined ? t('off') : t('live', { until: `${format.date(standingRule.validUntil)} ${format.time(standingRule.validUntil)}`, count: dailyCount })}
      </p>
      {!isOwner ? <p className="text-muted-foreground">{t('ownerOnly')}</p> : (
        <div className="grid gap-4">
          <PasskeyGate {...gate} returnTo={shopRoutes.queue}>
            <GrantStandingRuleForm dailyCount={standingRule === undefined ? 3 : dailyCount} />
          </PasskeyGate>
          {standingRule === undefined ? null : <RevokeStandingRuleForm />}
        </div>
      )}
    </section>
  )
}
