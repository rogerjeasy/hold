import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { routes } from '@/lib/routes'
import { requestSignUp } from './actions'
import { AuthForm } from './auth-form'
import { AuthShell } from './auth-shell'
import { CodeStep } from './code-step'
import { SignUpSteps } from './sign-up-steps'

// `codeSentTo` is the address a code went to, once the form was sent. The page then asks for the code.
export function SignUpScreen({ codeSentTo }: { codeSentTo?: string | undefined }) {
  const t = useTranslations('auth.signUp')
  const code = useTranslations('auth.code')
  const stepsTitleId = useId()

  return (
    <AuthShell
      title={codeSentTo === undefined ? t('title') : code('title')}
      lead={codeSentTo === undefined ? t('lead') : code('lead', { email: codeSentTo })}
      form={codeSentTo === undefined ? <AuthForm kind="signUp" action={requestSignUp} /> : <CodeStep page="signUp" />}
      other={{ question: t('switch'), action: t('switchAction'), href: routes.signIn }}
      aside={{
        title: t('aside.title'),
        titleId: stepsTitleId,
        children: <SignUpSteps labelledBy={stepsTitleId} />,
      }}
    />
  )
}
