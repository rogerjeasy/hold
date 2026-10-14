'use client'

import { ArrowRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useRef, useState, type ComponentProps, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { initialAuthFormState, type AuthAction } from './auth-form-state'
import { parseAuthInput, signInFields, signUpFields, type AuthField, type Problems } from './auth-input'
import { FormField } from './form-field'
import { PasskeyButton } from './passkey-button'

const fieldsOf = { signIn: signInFields, signUp: signUpFields, invite: ['name'] as const } as const

export type AuthKind = keyof typeof fieldsOf

// What the browser and the phone keyboard need to know about each field.
const inputProps: Record<AuthField, ComponentProps<'input'>> = {
  name: { autoComplete: 'name', maxLength: 100 },
  shopName: { autoComplete: 'organization', maxLength: 100 },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false, maxLength: 254 },
}

// One form for both pages: the fields differ, the rules and the behavior do not.
// `hidden` carries fields the visitor does not type, such as an invitation's token.
export function AuthForm({ kind, action, hidden = {} }: { kind: AuthKind; action: AuthAction; hidden?: Readonly<Record<string, string>> }) {
  const t = useTranslations('auth')
  const locale = useLocale()
  const form = useRef<HTMLFormElement>(null)
  const fields: readonly AuthField[] = fieldsOf[kind]
  const [state, submit, pending] = useActionState(action, initialAuthFormState)
  // Problems found in the browser stand in for the server's until the next good submission.
  const [found, setFound] = useState<Problems | null>(null)
  const problems = found ?? state.problems

  function check(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    // The shop's time zone is the browser's. It is set here, as the form leaves, because the server cannot know it.
    const timeZone = event.currentTarget.elements.namedItem('timeZone')
    if (timeZone instanceof HTMLInputElement) timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
    const data = new FormData(event.currentTarget)
    const parsed = parseAuthInput(fields, Object.fromEntries(fields.map((field) => [field, data.get(field)])))
    if (parsed.ok) {
      setFound(null)
      return
    }
    event.preventDefault()
    setFound(parsed.problems)
    const first = event.currentTarget.elements.namedItem(fields.find((field) => parsed.problems[field] !== undefined) ?? '')
    if (first instanceof HTMLElement) first.focus()
  }

  return (
    // The browser's own messages are in its language, not the page's, so the form does its own checking.
    <form ref={form} action={submit} onSubmit={check} noValidate className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {kind === 'signUp' ? <input type="hidden" name="timeZone" defaultValue="" /> : null}
      {fields.map((field) => {
        const problem = problems[field]
        return (
          <FormField
            key={field}
            name={field}
            label={t(`fields.${field}`)}
            defaultValue={state.values[field]}
            problem={problem === undefined ? undefined : t(`problems.${field}.${problem}`)}
            {...inputProps[field]}
          />
        )
      })}
      <div className="grid gap-3">
        <Button type="submit" disabled={pending} className="min-h-12">
          {pending ? t('sending') : t(`${kind}.submit`)}
          <ArrowRight aria-hidden="true" />
        </Button>
        <p className="text-[0.9375rem] text-muted-foreground">{t('passwordless')}</p>
      </div>
      {kind === 'signIn' ? (
        <PasskeyButton
          label={t('passkey.signIn')}
          email={() => {
            const field = form.current?.elements.namedItem('email')
            return field instanceof HTMLInputElement ? field.value.trim() : ''
          }}
        />
      ) : null}
      {state.notice !== undefined && found === null ? (
        <Notice announced title={t(`notices.${state.notice}.title`)} body={t(`notices.${state.notice}.body`)} />
      ) : null}
    </form>
  )
}
