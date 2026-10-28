import { shopDay } from '@hold/domain'
import type { PartOfDay } from '@hold/domain'
import type { ShopToday } from '@hold/db'
import { Notice } from '@/components/ui/notice'
import { useTranslations } from 'next-intl'
import { ActivityList } from './activity-list'
import { CounterList } from './counter-list'
import { DecisionList } from './decision-list'
import { decisionsFor, holdSummary } from './decisions'
import { HoldsPanel } from './holds-panel'
import { MonthPanel } from './month-panel'
import { SampleOffer } from './sample-offer'
import { setupDone, SetupSteps } from './setup-steps'
import type { SetupStatus } from './setup-steps'
import { TodayFigures } from './today-figures'
import { TodayHeader } from './today-header'

type TodayScreenProps = {
  readonly firstName: string
  readonly shop: { readonly name: string; readonly timeZone: string; readonly currency: string | null }
  readonly now: Date
  readonly part: PartOfDay
  readonly setup: SetupStatus
  readonly today: ShopToday
  // Sample rentals are offered to an owner whose shop has none. They need a published price list.
  readonly samples: 'offer' | 'needs_prices' | 'none'
}

// The first page after signing in: the shop's day at a glance, and what waits on a person.
export function TodayScreen({ firstName, shop, now, part, setup, today, samples }: TodayScreenProps) {
  const t = useTranslations('today.sample')
  const clock = { timeZone: shop.timeZone, currency: shop.currency }
  const day = shopDay(shop.timeZone, now)
  const decisions = decisionsFor(today, now)
  const holds = holdSummary(today.activeHolds, now)
  const setupComplete = Object.values(setupDone(setup)).every(Boolean)

  return (
    <div className="mx-auto grid w-full max-w-app gap-6 px-4 pt-7 pb-14 md:gap-7 md:px-8 md:pt-10 lg:px-10">
      <TodayHeader name={firstName} part={part} now={now} clock={clock} decisions={decisions.length} dueBack={today.dueBackToday} />
      {today.rentals.simulated > 0 ? <Notice title={t('noticeTitle')} body={t('noticeBody')} /> : null}
      {samples === 'none' ? null : <SampleOffer needsPrices={samples === 'needs_prices'} />}
      {setupComplete ? null : <SetupSteps setup={setup} />}
      <TodayFigures today={today} holds={holds} clock={clock} />
      <div className="grid items-start gap-6 md:gap-7 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6 md:gap-7">
          <DecisionList decisions={decisions} clock={clock} />
          <CounterList visits={today.counter} now={now} day={day} clock={clock} />
        </div>
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:gap-7 xl:grid-cols-1">
          <HoldsPanel holds={holds} clock={clock} />
          <MonthPanel month={today.month} routine={today.routine} now={now} clock={clock} />
          <div className="md:col-span-2 xl:col-span-1">
            <ActivityList lines={today.activity} day={day} clock={clock} />
          </div>
        </div>
      </div>
    </div>
  )
}
