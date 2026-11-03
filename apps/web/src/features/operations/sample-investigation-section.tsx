'use client'

import type { SampleInvestigationStatus } from '@hold/db'
import { Bot } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { SampleTag } from '@/components/ui/sample-tag'
import { ActionMessage } from '@/features/shop/action-message'
import { useLookAgain } from '@/hooks/use-look-again'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { modelName } from '@/lib/model-name'
import { investigateSamples } from './actions'

export type SampleInvestigation = { readonly waiting: number; readonly status: SampleInvestigationStatus | undefined }

// While the agent investigates, the page looks again until the worker's ten minutes are over.
const LOOK_FOR_MS = 10 * 60_000

// A demo's sample entries, seeded as no model looked at them, investigated by the operations agent when the owner or a
// manager asks (extensions.md section 6.14). How it stands is read from the server, so a reload keeps it.
export function SampleInvestigationSection({ samples, clock }: { samples: SampleInvestigation; clock: ShopClock }) {
  const t = useTranslations('operations.samples')
  const locale = useLocale()
  const format = useShopFormat(clock)
  const [result, investigate, pending] = useActionState(investigateSamples, null)
  const { status } = samples
  const running = status?.state === 'running'
  useLookAgain(running || (result?.ok === true && status === undefined), { forMs: LOOK_FOR_MS })
  const started = status === undefined ? '' : format.time(status.startedAt)
  const finished = status === undefined || status.completedAt === null ? '' : format.time(status.completedAt)
  const line = status === undefined ? null
    : status.state === 'running' ? t('running', { at: started })
      : status.state === 'stalled' || status.state === 'failed' ? t('stalled', { at: started })
        : status.investigated > 0 && status.model !== null ? t('investigated', { model: modelName(status.model), count: status.investigated, at: finished })
          : t('notAnswered', { at: finished })
  return (
    <section aria-labelledby="sample-investigation" className="surface relative isolate grid max-w-prose gap-3 overflow-clip p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="sample-investigation" className="text-lg font-semibold text-pretty">{t('title')}</h2>
        <SampleTag />
      </div>
      <p className="text-pretty">{t('body')}</p>
      {line === null ? null : (
        <p role="status" className="flex items-start gap-2">
          <Bot aria-hidden="true" className={running ? 'mt-0.5 size-4.5 shrink-0 animate-pulse motion-reduce:animate-none' : 'mt-0.5 size-4.5 shrink-0'} />
          {line}
        </p>
      )}
      {samples.waiting === 0 || running ? null : (
        <form action={investigate} className="grid justify-items-start gap-2">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" disabled={pending} className="min-h-11 whitespace-normal">{pending ? t('starting') : t('start')}</Button>
          <p className="text-sm text-muted-foreground">{t('allowance')}</p>
          <ActionMessage result={result} success={t('started')} results="operations.results" />
        </form>
      )}
    </section>
  )
}
