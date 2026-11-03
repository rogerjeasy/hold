import type { PublishedTrustLadder } from '@hold/db'
import { cn } from 'cn'
import { Lock, TrendingDown } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { formatMoney } from '@/lib/money'

type Step = { readonly key: string; readonly share: number; readonly words: string; readonly note?: string; readonly locked: boolean }

// One step of the ladder: the share of the hold kept, as a figure and as a bar, and the rung in plain words. From sm the
// bars stand side by side and fall as trust grows, so the ladder reads as a staircase; on a phone they lie down.
function LadderStep({ step, index }: { step: Step; index: number }) {
  return (
    <li className="grid min-w-0 content-start gap-3 sm:grid-rows-[auto_7rem_auto]">
      {/* The sentence below says the share in words; the figure repeats it for the eye. */}
      <p aria-hidden="true" className="flex items-baseline gap-2">
        {/* The colour sits on its own element: merged with the size, cn would keep only one of them. */}
        <span className="text-figure tabular-nums"><span className={cn(index > 0 && !step.locked && 'text-primary')}>{step.share}%</span></span>
        {step.locked ? <Lock aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
      </p>
      <div aria-hidden="true" className="relative h-2.5 overflow-hidden rounded-full bg-muted sm:hidden">
        <div className={cn('absolute inset-y-0 left-0 animate-fade rounded-full', index === 0 ? 'bg-foreground/20' : step.locked ? 'bg-border-strong' : 'bg-primary')} style={{ width: `${String(step.share)}%` }} />
      </div>
      <div aria-hidden="true" className="relative hidden overflow-hidden rounded-xl bg-muted/70 sm:block">
        <div
          className={cn('absolute inset-x-0 bottom-0 animate-rise rounded-xl', index === 0 ? 'bg-foreground/20' : step.locked ? 'bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_6px,transparent_6px_12px)]' : 'bg-primary')}
          style={{ height: `${String(Math.max(step.share, 4))}%`, animationDelay: `${String(index * 90)}ms` }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-pretty wrap-long-words">{step.words}</p>
        {step.note === undefined ? null : <p className="mt-1 text-[0.8125rem] text-muted-foreground">{step.note}</p>}
      </div>
    </li>
  )
}

// The ladder renters are held under now: its version, what counts, and each rung in plain words, drawn as steps down
// from the whole hold.
export function CurrentLadder({ current }: { current: PublishedTrustLadder | undefined }) {
  const t = useTranslations('trust.ladder')
  const format = useFormatter()
  const locale = useLocale()
  if (current === undefined) {
    return (
      <p className="surface flex max-w-2xl items-center gap-3.5 px-4 py-4 md:px-5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><TrendingDown className="size-5" /></span>
        <span className="min-w-0 text-muted-foreground">{t('none')}</span>
      </p>
    )
  }
  const { ladder } = current
  const steps: Step[] = [
    { key: 'zero', share: 100, words: t('rungZero'), locked: false },
    ...ladder.rungs.map((rung) => ({
      key: String(rung.cleanReturns),
      share: rung.sharePercent,
      words: t('rungLine', { count: rung.cleanReturns, share: rung.sharePercent, cover: rung.largestValue === undefined ? t('anyValue') : t('upTo', { amount: formatMoney(rung.largestValue, locale) }) }),
      ...(rung.needsSavedMethod ? { note: t('neverReached') } : {}),
      locked: rung.needsSavedMethod,
    })),
  ]
  return (
    <section aria-label={t('rungs')} className="surface overflow-clip">
      <div className="grid gap-1.5 border-b border-border/70 px-4 py-4 md:px-5">
        <p className="font-semibold">{t('current', { version: current.version, date: format.dateTime(current.publishedAt, { dateStyle: 'medium' }) })}</p>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {t('historyLine', { history: t(`historyNames.${ladder.history}`), months: ladder.windowMonths, fee: formatMoney(ladder.minimumFee, locale), hours: ladder.minimumHours })}
        </p>
      </div>
      <ol className="grid gap-6 p-4 sm:grid-cols-[repeat(auto-fill,minmax(9rem,13rem))] sm:gap-4 md:p-5">
        {steps.map((step, index) => <LadderStep key={step.key} step={step} index={index} />)}
      </ol>
    </section>
  )
}
