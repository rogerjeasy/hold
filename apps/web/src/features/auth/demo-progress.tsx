'use client'

import { cn } from 'cn'
import { LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// A new demo takes about twenty seconds on the server, which says nothing until it is done. The steps move on a
// clock, so each is worded as under way: none is ever shown as finished, and the last one waits for the answer.
const steps = [
  { key: 'shop', startsAfterMs: 0 },
  { key: 'rentals', startsAfterMs: 7_000 },
  { key: 'today', startsAfterMs: 16_000 },
] as const

function useCurrentStep(): number {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const timers = steps.slice(1).map((step, index) =>
      setTimeout(() => {
        setCurrent(index + 1)
      }, step.startsAfterMs),
    )
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [])
  return current
}

export function DemoProgress({ id, lead }: { id: string; lead: string }) {
  const t = useTranslations('auth.demo.steps')
  const current = useCurrentStep()

  return (
    <div id={id} role="status" className="animate-rise rounded-xl border border-border/70 bg-muted/60 p-4">
      <p className="sr-only">{t('title')}</p>
      <ol className="grid gap-2.5">
        {steps.map((step, index) => {
          const isCurrent = index === current
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2.5 text-[0.9375rem] transition-colors duration-500',
                isCurrent ? 'font-semibold text-foreground' : index < current ? 'text-muted-foreground' : 'text-muted-foreground/70',
              )}
            >
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
                {isCurrent ? (
                  <LoaderCircle className="size-4.5 animate-spin text-primary" />
                ) : (
                  <span className={cn('size-1.5 rounded-full', index < current ? 'bg-muted-foreground' : 'bg-border-strong')} />
                )}
              </span>
              <span className="min-w-0 wrap-long-words">{t(step.key)}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 border-t border-border/70 pt-3 text-sm text-muted-foreground wrap-long-words">{lead}</p>
    </div>
  )
}
