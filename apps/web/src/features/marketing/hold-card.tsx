import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { exampleRental, type OutcomeKey } from './example-rental'
import { HoldMeter } from './hold-meter'
import type { Tone } from './section'

type HoldCardProps = {
  // Left out while the rental is still running.
  outcome?: OutcomeKey
  tone?: Tone
  className?: string
  children?: ReactNode
}

// The hold as a record: its number, and where its money stands.
export function HoldCard({ outcome, tone = 'page', className, children }: HoldCardProps) {
  const t = useTranslations('bothSides.hold')
  const title = t('title', { number: exampleRental.holdNumber })

  return (
    <div
      role="group"
      aria-label={title}
      className={cn('w-full border p-4', tone === 'band' ? 'border-band-border' : 'border-foreground bg-card', className)}
    >
      <p className="mb-3 font-bold">{title}</p>
      <HoldMeter
        reservedCents={exampleRental.reservedCents}
        settled={outcome === undefined ? undefined : exampleRental.outcomes[outcome]}
        tone={tone}
      />
      {children}
    </div>
  )
}
