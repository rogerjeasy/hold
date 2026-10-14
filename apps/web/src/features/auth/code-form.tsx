'use client'

import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useState, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { initialCodeFormState, type CodeAction, type CodeFormState } from './auth-form-state'
import { parseCode, type CodeProblem } from './code-input'
import { FormField } from './form-field'

type CodeFormProps = {
  submit: CodeAction
  resend: () => Promise<CodeFormState>
}

// The second step: the code from the email, with a way to ask for a new one.
export function CodeForm({ submit, resend }: CodeFormProps) {
  const t = useTranslations('auth.code')
  const [state, submitAction, pending] = useActionState(submit, initialCodeFormState)
  const [resent, resendAction, resending] = useActionState(resend, initialCodeFormState)
  // A problem found in the browser stands in for the server's until the next good submission.
  const [found, setFound] = useState<CodeProblem | null>(null)
  const problem = found ?? state.problem ?? resent.problem
  const announced = state.resent === true || resent.resent === true

  function check(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    const parsed = parseCode(new FormData(event.currentTarget).get('code'))
    if (parsed.ok) {
      setFound(null)
      return
    }
    event.preventDefault()
    setFound(parsed.problem)
    const field = event.currentTarget.elements.namedItem('code')
    if (field instanceof HTMLElement) field.focus()
  }

  return (
    <div className="grid gap-5">
      <form action={submitAction} onSubmit={check} noValidate className="grid gap-5">
        <FormField
          name="code"
          label={t('field')}
          problem={problem === undefined ? undefined : t(`problems.${problem}`)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          spellCheck={false}
          autoFocus
          className="figures tracking-widest"
        />
        <Button type="submit" disabled={pending} className="min-h-12">
          {pending ? t('checking') : t('submit')}
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
      <form action={resendAction}>
        <Button type="submit" variant="outline" disabled={resending} className="min-h-11 w-full">
          {resending ? t('sending') : t('resend')}
        </Button>
      </form>
      {announced && problem === undefined ? <Notice announced title={t('resent.title')} body={t('resent.body')} /> : null}
    </div>
  )
}
