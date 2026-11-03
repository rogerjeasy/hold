import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'
import type { Tone } from './section'
import { useExampleMoney } from './use-example-money'

type HoldMeterProps = {
  reservedCents: number
  // Left out while the hold is still open: the whole amount is reserved and nothing has been taken or released.
  settled?: { takenCents: number; releasedCents: number }
  tone?: Tone
  className?: string
}

// Diagonal lines mean reserved, a solid block means taken, and an empty block means released. The amounts say it again in words.
const swatches = {
  reserved: 'bg-[repeating-linear-gradient(135deg,currentColor_0_1.5px,transparent_1.5px_6px)]',
  taken: { page: 'bg-primary', band: 'bg-band-accent' },
  released: '',
} as const

function Amount({ swatch, label, amount }: { swatch: string; label: string; amount: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-xs border border-current', swatch)} />
      <dt className="opacity-70">{label}</dt>
      <dd className="font-medium">{amount}</dd>
    </div>
  )
}

export function HoldMeter({ reservedCents, settled, tone = 'page', className }: HoldMeterProps) {
  const t = useTranslations('bothSides.hold')
  const label = useTranslations('holdMeter')
  const money = useExampleMoney()
  const reserved = money(reservedCents)
  const takenShare = settled === undefined ? 0 : (settled.takenCents * 100) / reservedCents
  const barStyle: CSSProperties & Record<'--taken', string> = { '--taken': `${String(takenShare)}%` }
  const summary =
    settled === undefined
      ? label('open', { reserved })
      : label('summary', { reserved, taken: money(settled.takenCents), released: money(settled.releasedCents) })

  return (
    <div className={className}>
      <div role="img" aria-label={summary} style={barStyle} className="flex h-4 overflow-clip rounded-full border border-current">
        {settled === undefined ? (
          <span className={cn('w-full', swatches.reserved)} />
        ) : (
          <span className={cn('w-(--taken)', settled.takenCents > 0 && 'border-r border-current', swatches.taken[tone])} />
        )}
      </div>
      <dl className="figures mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]">
        {settled === undefined ? (
          <>
            <Amount swatch={swatches.reserved} label={t('reserved')} amount={money(reservedCents, 'exact')} />
            <Amount swatch={swatches.taken[tone]} label={t('taken')} amount={money(0, 'exact')} />
          </>
        ) : (
          <>
            <Amount swatch={swatches.taken[tone]} label={t('taken')} amount={money(settled.takenCents, 'exact')} />
            <Amount swatch={swatches.released} label={t('released')} amount={money(settled.releasedCents, 'exact')} />
          </>
        )}
      </dl>
    </div>
  )
}
