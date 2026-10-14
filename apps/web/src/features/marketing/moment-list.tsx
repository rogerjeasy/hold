import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { CaptureScreen } from './capture-screen'
import { ConditionReport } from './condition-report'
import { EvidenceViewer } from './evidence-viewer'
import { exampleRental } from './example-rental'
import { HoldCard } from './hold-card'
import { OutcomeCards } from './outcome-cards'
import { PhoneFrame } from './phone-frame'
import { PointList } from './point-list'
import { ReserveScreen } from './reserve-screen'
import { useExampleMoney } from './use-example-money'

const momentKeys = ['reserve', 'handOver', 'return', 'settle'] as const
const pointKeys = ['a', 'b', 'c'] as const

type MomentKey = (typeof momentKeys)[number]

// A phone and the record that moment leaves behind, side by side where there is room for both.
function PhoneWithRecord({ caption, screen, record }: { caption: string; screen: ReactNode; record: ReactNode }) {
  return (
    <div className="grid items-center justify-items-center gap-6 border bg-card px-4 py-8 sm:max-lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-8 sm:px-8 lg:py-10 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <PhoneFrame caption={caption}>{screen}</PhoneFrame>
      <div className="w-full max-w-device sm:max-lg:max-w-none xl:max-w-none">{record}</div>
    </div>
  )
}

function MomentVisual({ moment }: { moment: MomentKey }) {
  const t = useTranslations('pages.howItWorks')

  if (moment === 'reserve') {
    return (
      <PhoneWithRecord
        caption={t('reserveScreen.caption')}
        screen={<ReserveScreen />}
        record={
          <HoldCard className="bg-background">
            <p className="mt-3 text-[0.9375rem] text-muted-foreground">{t('holdCard.note')}</p>
          </HoldCard>
        }
      />
    )
  }
  if (moment === 'handOver') {
    return <PhoneWithRecord caption={t('captureScreen.caption')} screen={<CaptureScreen />} record={<ConditionReport />} />
  }
  if (moment === 'return') return <EvidenceViewer />
  return <OutcomeCards />
}

// The rental told in order. Each moment has the words on one side and what it produces on the other.
export function MomentList() {
  const t = useTranslations('pages.howItWorks.moments')
  const steps = useTranslations('steps.items')
  const money = useExampleMoney()
  const { takenCents, releasedCents } = exampleRental.outcomes.damage
  const values = {
    amount: money(exampleRental.reservedCents),
    count: exampleRental.photographCount,
    taken: money(takenCents),
    released: money(releasedCents),
  }

  return (
    <ol role="list">
      {momentKeys.map((key, index) => {
        // The comparison and the two outcomes need the full width. The phones sit beside their words.
        const wide = key === 'return' || key === 'settle'
        return (
          <li
            key={key}
            className={cn(
              'grid gap-x-12 gap-y-8 border-t border-t-foreground pt-6 pb-14 last:pb-0 lg:pt-8 lg:pb-20',
              !wide && 'lg:grid-cols-[5fr_7fr]',
            )}
          >
            <div className={cn('min-w-0', wide && 'grid gap-x-12 gap-y-5 lg:grid-cols-[5fr_7fr]')}>
              <div>
                <span aria-hidden="true" className="label text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-headline wrap-long-words">{steps(`${key}.title`)}</h3>
                <p className="label mt-3 text-[0.8125rem] text-muted-foreground">{t(`${key}.who`)}</p>
                <span className="figures mt-5 inline-block border border-border-strong bg-card px-2 py-1 text-sm">{steps(`${key}.state`, values)}</span>
              </div>
              <div className={cn(!wide && 'mt-6')}>
                <p className="max-w-prose text-lead">{t(`${key}.body`)}</p>
                <PointList points={pointKeys.map((point) => t(`${key}.points.${point}`))} className="mt-5 text-muted-foreground" />
              </div>
            </div>
            <div className="min-w-0">
              <MomentVisual moment={key} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
