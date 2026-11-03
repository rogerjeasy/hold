import type { QueueEntry } from '@hold/db'
import type { ProposalKind } from '@hold/domain'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { QueueEntryCard } from './queue-entry-card'
import { RELEASE_TOGETHER_FORM } from './release-together'
import { ReleaseTogetherForm } from './release-together-form'

// The queue grouped by kind, each group in the order its first entry comes: nearest deadline first, then money.
export function groupByKind(entries: readonly QueueEntry[]): { kind: ProposalKind; entries: QueueEntry[] }[] {
  const groups = new Map<ProposalKind, QueueEntry[]>()
  for (const entry of entries) groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry])
  return [...groups].map(([kind, grouped]) => ({ kind, entries: grouped }))
}

type QueueGroupsProps = { entries: readonly QueueEntry[]; clock: ShopClock; canDecide: boolean; passkeyNeeded: boolean }

export function QueueGroups({ entries, clock, canDecide, passkeyNeeded }: QueueGroupsProps) {
  const t = useTranslations('operations')
  return (
    <div className="grid gap-10">
      {groupByKind(entries).map((group) => {
        const together = canDecide && !passkeyNeeded && group.kind === 'release_hold' && group.entries.length > 1
        return (
          <section key={group.kind} aria-labelledby={`group-${group.kind}`} className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id={`group-${group.kind}`} className="text-[1.1875rem] font-extrabold tracking-tight">{t(`kinds.${group.kind}.group`)}</h2>
              <p className="figures rounded-full bg-muted px-2.5 py-0.5 text-[0.8125rem] text-muted-foreground">{t('count', { count: group.entries.length })}</p>
            </div>
            <ul className="grid stagger gap-4 lg:grid-cols-2">
              {group.entries.map((entry) => (
                <li key={entry.id} className="min-w-0">
                  <QueueEntryCard entry={entry} clock={clock} canDecide={canDecide} passkeyNeeded={passkeyNeeded} together={together ? RELEASE_TOGETHER_FORM : undefined} />
                </li>
              ))}
            </ul>
            {together ? <ReleaseTogetherForm /> : null}
          </section>
        )
      })}
    </div>
  )
}
