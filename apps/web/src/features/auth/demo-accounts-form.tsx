'use client'

import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { signInWithDemoAccount } from './actions'
import { initialDemoFormState } from './auth-form-state'

const accounts = [
  { key: 'owner', variant: 'default' },
  { key: 'staff', variant: 'outline' },
] as const

// The demo shop's two accounts, one tap each, shown only where demo mode is on (architecture.md section 20.3).
export function DemoAccountsForm() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const titleId = useId()
  const [state, submit, pending] = useActionState(signInWithDemoAccount, initialDemoFormState)

  return (
    <section aria-labelledby={titleId} className="border border-border-strong bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">
          {t('demo.title')}
        </h2>
        <SampleTag label={t('demo.tag')} />
      </div>
      <p className="mt-2 text-muted-foreground wrap-long-words">{t('demo.lead')}</p>
      <form action={submit} className="mt-4 grid gap-3">
        <input type="hidden" name="locale" value={locale} />
        {accounts.map(({ key, variant }) => (
          <div key={key} className="grid gap-1">
            <Button type="submit" name="account" value={key} variant={variant} disabled={pending} className="min-h-12 justify-between text-left whitespace-normal">
              {t(`demo.${key}.action`)}
              <ArrowRight aria-hidden="true" />
            </Button>
            <p className="text-[0.9375rem] text-muted-foreground">{t(`demo.${key}.hint`)}</p>
          </div>
        ))}
      </form>
      <p className="mt-4 text-[0.9375rem] text-muted-foreground wrap-long-words">{t('demo.note')}</p>
      {state.notice === undefined ? null : (
        <div className="mt-4">
          <Notice announced title={t(`notices.${state.notice}.title`)} body={t(`notices.${state.notice}.body`)} />
        </div>
      )}
    </section>
  )
}
