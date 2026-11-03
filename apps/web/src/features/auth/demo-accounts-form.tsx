'use client'

import { cn } from 'cn'
import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { signInWithDemoAccount } from './actions'
import { initialDemoFormState } from './auth-form-state'
import { DemoProgress } from './demo-progress'

const accounts = [
  { key: 'owner', variant: 'default' },
  { key: 'staff', variant: 'outline' },
] as const

type Choice = 'start' | 'continue'

// Which button sent the form: its `account` value, and whether it starts a demo or comes back to one.
type Pressed = { kind: Choice; account: string }

function pressedBy(event: SyntheticEvent<HTMLFormElement, SubmitEvent>, kind: Choice): Pressed {
  const submitter = event.nativeEvent.submitter
  return { kind, account: submitter instanceof HTMLButtonElement ? submitter.value : '' }
}

// A demo of the judge's own, one tap each, shown only where demo mode is on (architecture.md section 20.3). `new`
// starts one. `current` is a browser that started one: it comes back to it as either person, or starts a fresh one.
export function DemoAccountsForm({ demo }: { demo: 'new' | 'current' }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const titleId = useId()
  const progressId = useId()
  const [state, submit, pending] = useActionState(signInWithDemoAccount, initialDemoFormState)
  const choice: Choice = demo === 'current' ? 'continue' : 'start'
  // Which tap is waiting: a new demo takes about twenty seconds to set up, coming back to one only a sign-in.
  const [pressed, setPressed] = useState<Pressed>({ kind: choice, account: '' })
  const isPressed = (kind: Choice, account: string) => pending && pressed.kind === kind && pressed.account === account

  // The pressed button turns its arrow into a spinner, so the tap is answered at once.
  const mark = (kind: Choice, account: string) =>
    isPressed(kind, account) ? (
      <LoaderCircle aria-hidden="true" className="animate-spin" />
    ) : (
      <ArrowRight aria-hidden="true" className="transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
    )

  return (
    <section aria-labelledby={titleId} className="surface relative overflow-clip p-5 md:p-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="flex items-center gap-2.5 text-[1.0625rem] leading-tight font-extrabold tracking-tight">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          {t('demo.title')}
        </h2>
        <SampleTag label={t('demo.tag')} />
      </div>
      <p className="mt-3 text-muted-foreground wrap-long-words">{t(demo === 'current' ? 'demo.leadCurrent' : 'demo.lead')}</p>
      <form
        action={submit}
        onSubmit={(event) => {
          setPressed(pressedBy(event, choice))
        }}
        aria-busy={pending}
        className="mt-5 grid gap-3"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="demo" value={choice} />
        {accounts.map(({ key, variant }) => (
          <div key={key} className="grid gap-1.5">
            <Button
              type="submit"
              name="account"
              value={key}
              variant={variant}
              disabled={pending}
              aria-describedby={isPressed(choice, key) ? progressId : undefined}
              // The pressed choice stays at full strength while it works; the others step back.
              className={cn('group min-h-13 justify-between text-left whitespace-normal', isPressed(choice, key) && 'disabled:opacity-100')}
            >
              {t(`demo.${key}.${choice}`)}
              {mark(choice, key)}
            </Button>
            <p className="px-1 text-[0.9375rem] text-muted-foreground">{t(`demo.${key}.hint`)}</p>
          </div>
        ))}
      </form>
      {demo === 'current' ? (
        <form
          action={submit}
          onSubmit={(event) => {
            setPressed(pressedBy(event, 'start'))
          }}
          aria-busy={pending}
          className="mt-3 grid gap-1.5"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="demo" value="start" />
          <Button
            type="submit"
            name="account"
            value="owner"
            variant="ghost"
            disabled={pending}
            aria-describedby={isPressed('start', 'owner') ? progressId : undefined}
            className={cn('group min-h-12 justify-between text-left whitespace-normal', isPressed('start', 'owner') && 'disabled:opacity-100')}
          >
            {t('demo.fresh.action')}
            {mark('start', 'owner')}
          </Button>
          <p className="px-1 text-[0.9375rem] text-muted-foreground">{t('demo.fresh.hint')}</p>
        </form>
      ) : null}
      {pending ? (
        <div className="mt-4">
          {pressed.kind === 'start' ? (
            <DemoProgress id={progressId} lead={t('demo.pending.start')} />
          ) : (
            <p id={progressId} role="status" className="flex animate-rise items-start gap-2 rounded-xl bg-muted/60 p-4 font-semibold wrap-long-words">
              <LoaderCircle aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 animate-spin text-primary" />
              {t('demo.pending.continue')}
            </p>
          )}
        </div>
      ) : null}
      <p className="mt-5 border-t border-border/70 pt-4 text-sm text-muted-foreground wrap-long-words">{t('demo.note')}</p>
      {state.notice === undefined ? null : (
        <div className="mt-4">
          <Notice announced title={t(`notices.${state.notice}.title`)} body={t(`notices.${state.notice}.body`)} />
        </div>
      )}
    </section>
  )
}
