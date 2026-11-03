import type { OwnerRule } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/ui/status-pill'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { ConfirmRuleForm, DiscardRuleForm } from './rule-forms'

export type RuleRow = {
  readonly id: string
  readonly rule: OwnerRule
  readonly state: 'drafted' | 'confirmed' | 'discarded'
  // The amount of the proposal the rule was drafted from, read now from the records, for "below an amount".
  readonly suggestedCents: number | null
}

// The rules drafted from rejections, and those the owner confirmed: the agent's whole memory (extensions.md 6.5).
export function RulesSection({ rules, clock, isOwner }: { rules: readonly RuleRow[]; clock: ShopClock; isOwner: boolean }) {
  const t = useTranslations('operations.rules')
  const kinds = useTranslations('operations.kinds')
  const format = useShopFormat(clock)
  const text = (rule: OwnerRule) => {
    const what = kinds(`${rule.proposalKind}.rule`)
    return rule.kind === 'never' ? t('never', { what }) : t('below', { what, amount: format.money(rule.cents) })
  }
  return (
    <section aria-labelledby="owner-rules" className="grid min-w-0 gap-4">
      <h2 id="owner-rules" className="text-[1.1875rem] font-extrabold tracking-tight">{t('title')}</h2>
      <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
      {rules.length === 0 ? <p className="surface px-4 py-4 text-muted-foreground md:px-5">{t('none')}</p> : (
        <ul className="surface grid divide-y divide-border/70 overflow-clip">
          {rules.map((row) => (
            <li key={row.id} className="grid min-w-0 gap-2.5 px-4 py-4 md:px-5">
              <p className="font-semibold wrap-long-words">{text(row.rule)}</p>
              <p className="w-fit"><StatusPill tone={row.state === 'drafted' ? 'attention' : 'success'}>{row.state === 'drafted' ? t('drafted') : t('confirmed')}</StatusPill></p>
              {isOwner && row.state === 'drafted' ? (
                <ConfirmRuleForm ruleId={row.id} currency={clock.currency} suggestedCents={row.suggestedCents} />
              ) : null}
              {isOwner ? <DiscardRuleForm ruleId={row.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
