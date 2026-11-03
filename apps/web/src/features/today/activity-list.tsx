import type { ActivityLine } from '@hold/db'
import { History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The latest lines of the shop's audit trail, in words, on a rail: the newest at the top with the accent's dot.
export function ActivityList({ lines, day, clock }: { lines: readonly ActivityLine[]; day: { start: Date }; clock: ShopClock }) {
  const t = useTranslations('today.activity')
  const format = useShopFormat(clock)
  const label = (action: string) => {
    // An action is named by the code that wrote the line, so a line from a newer version may have no words yet.
    const key = `actions.${action}` as Parameters<typeof t>[0]
    return t.has(key) ? t(key) : t('actions.other')
  }

  return (
    <Panel title={t('title')} icon={History}>
      <ol className="relative px-4 py-3 before:absolute before:top-6 before:bottom-6 before:left-[calc(1.25rem_-_1px)] before:w-0.5 before:rounded-full before:bg-border md:px-5 md:before:left-[calc(1.5rem_-_1px)]">
        {lines.map((line, index) => (
          <li key={`${line.at.toISOString()}-${String(index)}`} className="relative grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3.5 py-2.5">
            <span aria-hidden="true" className={index === 0 ? 'mt-1.5 size-2 rounded-full bg-primary ring-4 ring-card' : 'mt-1.5 size-2 rounded-full bg-border-strong ring-4 ring-card'} />
            <div className="min-w-0">
              <time dateTime={line.at.toISOString()} className="figures block text-xs text-muted-foreground">
                {line.at >= day.start ? format.time(line.at) : format.when(line.at)}
              </time>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold">
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
