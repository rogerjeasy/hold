'use client'

import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { signInWithDemoAccount } from './actions'
import { initialDemoFormState } from './auth-form-state'

const accounts = [
  { key: 'owner', variant: 'default' },
  { key: 'staff', variant: 'outline' },
] as const

// A demo of the judge's own, one tap each, shown only where demo mode is on (architecture.md section 20.3). `new`
// starts one. `current` is a browser that started one: it comes back to it as either person, or starts a fresh one.
export function DemoAccountsForm({ demo }: { demo: 'new' | 'current' }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const titleId = useId()
  const [state, submit, pending] = useActionState(signInWithDemoAccount, initialDemoFormState)
  const choice = demo === 'current' ? 'continue' : 'start'
  // Which kind of tap is waiting: a new demo takes about twenty seconds to set up, coming back to one only a sign-in.
  const [submitted, setSubmitted] = useState<'start' | 'continue'>(choice)

  return (
    <section aria-labelledby={titleId} className="border border-border-strong bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">
          {t('demo.title')}
        </h2>
        <SampleTag label={t('demo.tag')} />
      </div>
      <p className="mt-2 text-muted-foreground wrap-long-words">{t(demo === 'current' ? 'demo.leadCurrent' : 'demo.lead')}</p>
      <form action={submit} onSubmit={() => { setSubmitted(choice) }} aria-busy={pending} className="mt-4 grid gap-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="demo" value={choice} />
        {accounts.map(({ key, variant }) => (
          <div key={key} className="grid gap-1">
            <Button type="submit" name="account" value={key} variant={variant} disabled={pending} className="min-h-12 justify-between text-left whitespace-normal">
              {t(`demo.${key}.${choice}`)}
              <ArrowRight aria-hidden="true" />
            </Button>
            <p className="text-[0.9375rem] text-muted-foreground">{t(`demo.${key}.hint`)}</p>
          </div>
        ))}
      </form>
      {demo === 'current' ? (
        <form action={submit} onSubmit={() => { setSubmitted('start') }} className="mt-3 grid gap-1">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="demo" value="start" />
          <Button type="submit" name="account" value="owner" variant="ghost" disabled={pending} className="min-h-12 justify-between text-left whitespace-normal">
            {t('demo.fresh.action')}
            <ArrowRight aria-hidden="true" />
          </Button>
          <p className="text-[0.9375rem] text-muted-foreground">{t('demo.fresh.hint')}</p>
        </form>
      ) : null}
      {pending ? (
        <p role="status" className="mt-4 flex items-start gap-2 font-semibold wrap-long-words">
          <LoaderCircle aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 animate-spin text-primary" />
          {t(`demo.pending.${submitted}`)}
        </p>
      ) : null}
      <p className="mt-4 text-[0.9375rem] text-muted-foreground wrap-long-words">{t('demo.note')}</p>
      {state.notice === undefined ? null : (
        <div className="mt-4">
          <Notice announced title={t(`notices.${state.notice}.title`)} body={t(`notices.${state.notice}.body`)} />
        </div>
      )}
    </section>
  )
}
