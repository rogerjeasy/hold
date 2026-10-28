'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

// How strongly the handover photograph shows over the camera at a return, in percent: faint enough to see the item
// through it, strong enough to line its edges up.
export const GHOST_STRENGTH = { initial: 40, min: 10, max: 90, step: 10 } as const

type GhostControlsProps = { shown: boolean; onShown: (shown: boolean) => void; strength: number; onStrength: (strength: number) => void }

// Staff can take the ghost away to see the item clearly, and make it stronger or fainter for the light they work in.
export function GhostControls({ shown, onShown, strength, onStrength }: GhostControlsProps) {
  const t = useTranslations('shop.handover.taker')
  const id = useId()
  const percent = t('ghostPercent', { percent: strength })
  return (
    <div className="grid gap-2">
      <label className="flex min-h-11 min-w-0 items-center gap-3">
        <input type="checkbox" checked={shown} onChange={(event) => { onShown(event.target.checked) }} className="min-h-11 min-w-11 shrink-0 accent-primary" />
        <span className="min-w-0 wrap-long-words">{t('ghostShown')}</span>
      </label>
      <div className="grid min-w-0 gap-1">
        <label htmlFor={id} className="text-sm font-medium wrap-long-words">{t('ghostStrength')}</label>
        <div className="flex min-w-0 items-center gap-3">
          <input
            id={id}
            type="range"
            min={GHOST_STRENGTH.min}
            max={GHOST_STRENGTH.max}
            step={GHOST_STRENGTH.step}
            value={strength}
            disabled={!shown}
            aria-valuetext={percent}
            onChange={(event) => { onStrength(Number(event.target.value)) }}
            className="min-h-11 min-w-0 flex-1 accent-primary disabled:opacity-50"
          />
          <output htmlFor={id} className="w-12 shrink-0 text-right tabular-nums">{percent}</output>
        </div>
      </div>
    </div>
  )
}
