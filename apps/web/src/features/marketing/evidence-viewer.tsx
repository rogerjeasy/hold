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
  return <span className={cn('label absolute top-3.5 bg-photo-scrim px-2.5 py-1 text-[0.8125rem] text-photo-foreground', className)}>{children}</span>
}

export function EvidenceViewer({ className }: { className?: string }) {
  const t = useTranslations('evidence')
  const format = useFormatter()
  const [outcome, setOutcome] = useState<OutcomeKey>('damage')
  const [position, setPosition] = useState(INITIAL_POSITION)
  const takenAt = (date: Date) =>
    format.dateTime(date, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const stageStyle: CSSProperties & Record<'--position', string> = { '--position': `${String(position)}%` }

  return (
    <div className={className}>
      <div data-testid="evidence-stage" style={stageStyle} className="relative aspect-evidence-tall overflow-hidden bg-photo sm:aspect-evidence">
        <EvidenceLayer src={outcome === 'damage' ? evidencePhoto.returnSrc : evidencePhoto.handoverSrc} alt={t('returnAlt')} preload>
          <EvidenceMarks showNew={outcome === 'damage'} newLabel={t('newTag')} />
        </EvidenceLayer>
        <EvidenceLayer
          src={evidencePhoto.handoverSrc}
          alt={t('handoverAlt')}
          preload
          className="[clip-path:inset(0_calc(100%-var(--position))_0_0)]"
        />
        <PhotoTag className="left-3.5">
          {t('handover')}
          <span className="hidden sm:inline"> · {takenAt(exampleRental.handoverAt)}</span>
        </PhotoTag>
        <PhotoTag className="right-3.5">
          {t('return')}
          <span className="hidden sm:inline"> · {takenAt(exampleRental.returnAt)}</span>
        </PhotoTag>
        <span aria-hidden="true" className="absolute inset-y-0 left-(--position) w-0.5 -translate-x-1/2 bg-photo-foreground" />
        <input
          type="range"
          min={MIN_POSITION}
          max={MAX_POSITION}
          value={position}
          onChange={(event) => {
            setPosition(Number(event.target.value))
          }}
          aria-label={t('slider')}
          className="peer absolute inset-0 size-full cursor-ew-resize touch-pan-y opacity-0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-(--position) grid size-11 -translate-1/2 place-items-center rounded-full bg-photo-foreground text-photo peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mark"
        >
          <ChevronsLeftRight className="size-5" />
        </span>
        <OutcomeToggle value={outcome} onChange={setOutcome} className="absolute bottom-3.5 left-3.5 z-10 max-sm:right-3.5" />
      </div>
      <EvidenceLegend outcome={outcome} />
    </div>
  )
}
