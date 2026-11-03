'use client'

import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { exampleRental, type OutcomeKey } from './example-rental'
import { HoldCard } from './hold-card'
import { OutcomeToggle } from './outcome-toggle'
import { useExampleMoney } from './use-example-money'

// The Orders v2 and Payments v2 calls behind each step. docs/tech-stack.md section 5.
const calls = {
  order: { path: '/v2/checkout/orders', detail: 'intent: "AUTHORIZE"' },
  authorize: { path: '/v2/checkout/orders/{id}/authorize', detail: null },
  renew: { path: '/v2/payments/authorizations/{id}/reauthorize', detail: null },
  capture: { path: '/v2/payments/authorizations/{id}/capture', detail: 'final_capture: true' },
  void: { path: '/v2/payments/authorizations/{id}/void', detail: null },
} as const

const lastStep = { damage: 'capture', clean: 'void' } as const

// One hold from its first call to its last. The reader chooses how the rental ended, and the last call follows.
export function HoldLifecycle() {
  const t = useTranslations('pages.paypal.lifecycle')
  const money = useExampleMoney()
  const [outcome, setOutcome] = useState<OutcomeKey>('damage')
  const stepKeys = ['order', 'authorize', 'renew', lastStep[outcome]] as const
  const values = {
    amount: money(exampleRental.reservedCents),
    taken: money(exampleRental.outcomes.damage.takenCents),
    released: money(exampleRental.outcomes.damage.releasedCents),
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:gap-16">
      <div className="min-w-0 lg:order-last">
        <div className="lg:sticky lg:top-24">
          <OutcomeToggle value={outcome} onChange={setOutcome} />
          <div aria-live="polite">
            <HoldCard outcome={outcome} tone="band" className="mt-4" />
          </div>
          <p className="mt-4 text-[0.9375rem] text-band-muted">{t('idempotency')}</p>
        </div>
      </div>
      <ol role="list" className="min-w-0">
        {stepKeys.map((key, index) => {
          const last = index === stepKeys.length - 1
          return (
            <li key={key} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0 md:gap-x-5">
              {/* One thread from the first call to the last; the last call's node is lit. */}
              {last ? null : <span aria-hidden="true" className="absolute top-6 bottom-0 left-[calc(0.75rem-0.5px)] border-l border-band-border" />}
              <span
                aria-hidden="true"
                className={cn('relative mt-1.5 size-3.5 justify-self-center rounded-full border-2', last ? 'border-band-accent bg-band-accent' : 'border-band-muted bg-band')}
              />
              <div className="min-w-0">
                <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`steps.${key}.title`)}</h3>
                <p className="mt-2 text-band-muted">{t(`steps.${key}.body`, values)}</p>
                <p className="figures mt-3 rounded-lg border border-band-border bg-band-hover px-3 py-2 text-[0.8125rem] wrap-anywhere">
                  <span className="sr-only">{t('call')}: </span>
                  <span className="text-band-accent">POST</span> {calls[key].path}
                  {calls[key].detail === null ? null : <span className="block text-band-muted">{calls[key].detail}</span>}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
