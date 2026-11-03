'use client'

import { cn } from 'cn'
import { ChevronsLeftRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { EvidenceLayer } from './evidence-layer'
import { EvidenceLegend } from './evidence-legend'
import { EvidenceMarks } from './evidence-marks'
import { evidencePhoto } from './evidence-photo'
import { exampleRental, type OutcomeKey } from './example-rental'
import { OutcomeToggle } from './outcome-toggle'

// Starts well to the left so both outlined marks sit on the return side at every width.
const INITIAL_POSITION = 20
const MIN_POSITION = 4
const MAX_POSITION = 96

function PhotoTag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'label absolute top-3 z-1 rounded-full bg-photo-scrim px-3 py-1 text-[0.8125rem] text-photo-foreground ring-1 ring-photo-foreground/15 backdrop-blur-md sm:top-4',
        className,
      )}
    >
      {children}
    </span>
  )
}

// The same frame at handover and at return, one over the other. The reader slides between them, and chooses how the
// rental ended. The stage and what it found sit together on one card.
export function EvidenceViewer({ className }: { className?: string }) {
  const t = useTranslations('evidence')
  const format = useFormatter()
  const [outcome, setOutcome] = useState<OutcomeKey>('damage')
  const [position, setPosition] = useState(INITIAL_POSITION)
  // The handle pulses until it is first moved, so a reader sees it can be.
  const [moved, setMoved] = useState(false)
  const takenAt = (date: Date) =>
    format.dateTime(date, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const stageStyle: CSSProperties & Record<'--position', string> = { '--position': `${String(position)}%` }

  return (
    <div className={cn('overflow-clip rounded-2xl bg-card shadow-overlay ring-1 ring-foreground/8 md:rounded-3xl', className)}>
      <div data-testid="evidence-stage" style={stageStyle} className="relative aspect-evidence-tall overflow-hidden bg-photo sm:aspect-evidence">
        <EvidenceLayer src={outcome === 'damage' ? evidencePhoto.returnSrc : evidencePhoto.handoverSrc} alt={t('returnAlt')} preload>
          <EvidenceMarks key={outcome} showNew={outcome === 'damage'} newLabel={t('newTag')} />
        </EvidenceLayer>
        <EvidenceLayer
          src={evidencePhoto.handoverSrc}
          alt={t('handoverAlt')}
          preload
          className="[clip-path:inset(0_calc(100%-var(--position))_0_0)]"
        />
        {/* A soft shade at the top and the bottom keeps the tags and the toggle legible on any photograph. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-photo/55 to-transparent" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-photo/60 to-transparent" />
        <PhotoTag className="left-3 sm:left-4">
          {t('handover')}
          <span className="hidden sm:inline"> · {takenAt(exampleRental.handoverAt)}</span>
        </PhotoTag>
        <PhotoTag className="right-3 sm:right-4">
          {t('return')}
          <span className="hidden sm:inline"> · {takenAt(exampleRental.returnAt)}</span>
        </PhotoTag>
        <span aria-hidden="true" className="absolute inset-y-0 left-(--position) w-0.5 -translate-x-1/2 bg-photo-foreground shadow-raised" />
        <input
          type="range"
          min={MIN_POSITION}
          max={MAX_POSITION}
          value={position}
          onChange={(event) => {
            setPosition(Number(event.target.value))
            setMoved(true)
          }}
          aria-label={t('slider')}
          className="peer absolute inset-0 size-full cursor-ew-resize touch-pan-y opacity-0"
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 left-(--position) grid size-12 -translate-1/2 place-items-center rounded-full bg-photo-foreground text-photo shadow-overlay ring-4 ring-photo-foreground/25 transition-transform duration-300 ease-spring',
            'peer-hover:scale-110 peer-active:scale-95 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-mark',
          )}
        >
          {moved ? null : <span className="absolute inset-0 animate-pulse-ring rounded-full text-photo-foreground" />}
          <ChevronsLeftRight className="size-5" />
        </span>
        <OutcomeToggle value={outcome} onChange={setOutcome} className="absolute bottom-3 left-3 z-10 max-sm:right-3 sm:bottom-4 sm:left-4" />
      </div>
      <EvidenceLegend outcome={outcome} />
    </div>
  )
}
