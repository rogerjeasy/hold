import { useFormatter, useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import type { RecordedRun } from './recorded-run'
import { TranscriptView } from './transcript-view'

// A recorded live run of the advocates on the demonstration's sample claim, said to be one above its transcript, so it
// is never read as this demo's own claim (extensions.md section 9).
export function RecordedRunView({ run }: { run: RecordedRun }) {
  const t = useTranslations('negotiation.sample.recorded')
  const format = useFormatter()
  const date = format.dateTime(run.recordedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
  return (
    <section className="grid gap-3">
      <Notice title={t('title')} body={t('body', { date })}>
        <p className="mt-2 text-sm text-muted-foreground wrap-long-words">{t('details', { model: run.model, promptVersion: run.promptVersion, calls: run.calls, tokens: format.number(run.tokens) })}</p>
      </Notice>
      <TranscriptView transcript={run.transcript} />
    </section>
  )
}
