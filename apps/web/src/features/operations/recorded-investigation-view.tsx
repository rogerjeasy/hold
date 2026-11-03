import { useFormatter, useTranslations } from 'next-intl'
import { useId } from 'react'
import { Notice } from '@/components/ui/notice'
import type { RecordedInvestigation } from './recorded-investigation'

type Entry = RecordedInvestigation['entries'][number]

// A recorded investigation of the operations agent: for each entry, what code found, what the agent proposed and why,
// with the PayPal tools it read. Said to be a recording over sample data, so it is never read as anyone's queue.
export function RecordedInvestigationView({ run }: { run: RecordedInvestigation }) {
  const t = useTranslations('operations.recorded')
  const format = useFormatter()
  const toolsId = useId()
  const date = format.dateTime(run.recordedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
  return (
    <div className="grid gap-5">
      <Notice title={t('title')} body={t('body', { model: run.model, date })}>
        <p className="mt-2 text-sm text-muted-foreground wrap-long-words">{t('details', { promptVersion: run.promptVersion, calls: run.toolCalls, tokens: format.number(run.tokens) })}</p>
        <p id={toolsId} className="label mt-3 text-xs text-muted-foreground">{t('tools')}</p>
        <ul aria-labelledby={toolsId} className="mt-1.5 flex flex-wrap gap-2">
          {run.tools.map((tool) => <li key={tool} className="min-w-0 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-sm wrap-long-words">{tool.replace(/^paypal\./, '')}</li>)}
        </ul>
      </Notice>
      <ul role="list" className="grid gap-4 md:grid-cols-2">
        {run.entries.map((entry) => <li key={`${entry.kind}-${entry.exceptionKind}`} className="min-w-0"><EntryCard entry={entry} /></li>)}
      </ul>
    </div>
  )
}

function EntryCard({ entry }: { entry: Entry }) {
  const t = useTranslations('operations')
  const titleId = useId()
  return (
    <article aria-labelledby={titleId} className="surface grid h-full min-w-0 content-start gap-4 p-4 md:p-5">
      <h3 id={titleId} className="text-[1.0625rem] leading-snug font-bold text-pretty wrap-long-words">{t(`kinds.${entry.kind}.action`)}</h3>
      <div className="grid gap-1.5">
        <p className="label text-xs text-muted-foreground">{t('recorded.found')}</p>
        <p className="text-muted-foreground text-pretty">{t(`fixedReasons.${entry.exceptionKind}`)}</p>
      </div>
      <div className="grid gap-1.5">
        <p className="label text-xs text-muted-foreground">{t('recorded.wrote')}</p>
        <p className="whitespace-pre-wrap text-pretty wrap-long-words">{entry.reason}</p>
      </div>
      <div className="grid gap-1.5">
        <p className="label text-xs text-muted-foreground">{t('references')}</p>
        {entry.references.length === 0 ? <p className="text-sm text-muted-foreground">{t('noReferences')}</p> : (
          <ul className="flex flex-wrap gap-2">
            {entry.references.map((reference) => <li key={reference} className="min-w-0 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-sm wrap-long-words">{reference}</li>)}
          </ul>
        )}
      </div>
      {entry.draft === null ? null : (
        <div className="grid gap-1.5">
          <p className="label text-xs text-muted-foreground">{t('draft')}</p>
          <p className="whitespace-pre-wrap text-pretty wrap-long-words">{entry.draft}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t('recorded.decides')}</p>
    </article>
  )
}
