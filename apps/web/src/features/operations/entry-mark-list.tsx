import { Bot, CircleSlash, SearchX, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { modelName } from '@/lib/model-name'
import type { EntryMark } from './entry-marks'

const ICONS: Readonly<Record<EntryMark, LucideIcon>> = { raisedByAgent: Bot, sampleNotInvestigated: SearchX, sampleInvestigated: Bot, notInvestigated: SearchX, paypalNotChecked: WifiOff, draftDropped: CircleSlash }

// How a queue entry was written, as chips with words, never colour alone: on the queue and on the decision board.
export function EntryMarkList({ marks, model }: { marks: readonly EntryMark[]; model: string | null }) {
  const t = useTranslations('operations.marks')
  if (marks.length === 0) return null
  const named = model === null ? '' : modelName(model)
  return (
    <ul className="flex flex-wrap gap-2">
      {marks.map((mark) => {
        const Icon = ICONS[mark]
        return (
          <li key={mark} className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-sm">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 wrap-long-words">{t(mark, { model: named })}</span>
          </li>
        )
      })}
    </ul>
  )
}
