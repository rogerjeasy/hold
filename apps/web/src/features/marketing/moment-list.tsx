import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { CaptureScreen } from './capture-screen'
import { ConditionReport } from './condition-report'
import { EvidenceViewer } from './evidence-viewer'
import { exampleRental } from './example-rental'
import { HoldCard } from './hold-card'
import { momentIcons, momentKeys, type MomentKey } from './moment-icons'
import { OutcomeCards } from './outcome-cards'
import { PhoneFrame } from './phone-frame'
import { PointList } from './point-list'
import { ReserveScreen } from './reserve-screen'
import { Stage } from './stage'
import { useExampleMoney } from './use-example-money'

const pointKeys = ['a', 'b', 'c'] as const

// A phone and the record that moment leaves behind, side by side where there is room for both.
function PhoneWithRecord({ caption, screen, record }: { caption: string; screen: ReactNode; record: ReactNode }) {
  return (
    <Stage className="grid items-center justify-items-center gap-6 px-4 py-10 sm:max-lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-8 sm:px-8 lg:py-12 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <PhoneFrame caption={caption}>{screen}</PhoneFrame>
      <div className="w-full max-w-device sm:max-lg:max-w-none xl:max-w-none">{record}</div>
    </Stage>
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
          <HoldCard className="shadow-raised">
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
      {momentKeys.map((key) => {
        const Icon = momentIcons[key]
        // The comparison and the two outcomes need the full width. The phones sit beside their words.
        const wide = key === 'return' || key === 'settle'
        return (
          <li
            key={key}
            className={cn(
              'grid gap-x-12 gap-y-8 border-t border-border/70 pt-8 pb-16 first:border-t-0 first:pt-0 last:pb-0 lg:pt-12 lg:pb-24',
              !wide && 'lg:grid-cols-[5fr_7fr]',
            )}
          >
            <div className={cn('min-w-0', wide && 'grid gap-x-12 gap-y-5 lg:grid-cols-[5fr_7fr]')}>
              <div>
                <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5.5" />
                </span>
                <h3 className="mt-5 text-headline wrap-long-words">{steps(`${key}.title`)}</h3>
                <p className="label mt-3 text-[0.8125rem] text-muted-foreground">{t(`${key}.who`)}</p>
                <span className="figures mt-5 inline-block rounded-full bg-card px-3 py-1 text-sm shadow-xs ring-1 ring-border">{steps(`${key}.state`, values)}</span>
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
