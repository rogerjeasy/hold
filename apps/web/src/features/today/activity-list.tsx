import type { ActivityLine } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The latest lines of the shop's audit trail, in words.
export function ActivityList({ lines, day, clock }: { lines: readonly ActivityLine[]; day: { start: Date }; clock: ShopClock }) {
  const t = useTranslations('today.activity')
  const format = useShopFormat(clock)
  const label = (action: string) => {
    // An action is named by the code that wrote the line, so a line from a newer version may have no words yet.
    const key = `actions.${action}` as Parameters<typeof t>[0]
    return t.has(key) ? t(key) : t('actions.other')
  }

  return (
    <Panel title={t('title')}>
      <ol className="px-4 md:px-5">
        {lines.map((line, index) => (
          <li key={`${line.at.toISOString()}-${String(index)}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
            <time dateTime={line.at.toISOString()} className="figures pt-0.5 text-xs text-muted-foreground">
              {line.at >= day.start ? format.time(line.at) : format.when(line.at)}
            </time>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold">
                {label(line.action)}
                {line.simulated ? <SampleTag /> : null}
              </p>
              {line.actorName === null && line.renterName === null ? null : (
                <p className="truncate text-[0.8125rem] text-muted-foreground">{[line.actorName, line.renterName].filter((part) => part !== null).join(' · ')}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
