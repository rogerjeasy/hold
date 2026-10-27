import { useTranslations } from 'next-intl'
import { ShopToday } from '@/features/marketing/shop-today'
import { routes } from '@/lib/routes'
import { requestSignIn } from './actions'
import { AuthForm } from './auth-form'
import { AuthShell } from './auth-shell'
import { CodeStep } from './code-step'
import { DemoAccountsForm } from './demo-accounts-form'

// `codeSentTo` is the address a code went to, once the form was sent. The page then asks for the code.
// `demo` offers a demo of the judge's own first, where demo mode is on: `current` where this browser started one.
export function SignInScreen({ codeSentTo, demo }: { codeSentTo?: string | undefined; demo?: 'new' | 'current' | undefined }) {
  const t = useTranslations('auth.signIn')
  const code = useTranslations('auth.code')

  return (
    <AuthShell
      title={codeSentTo === undefined ? t('title') : code('title')}
      lead={codeSentTo === undefined ? t('lead') : code('lead', { email: codeSentTo })}
      form={
        codeSentTo === undefined ? (
          <div className="grid gap-8">
            {demo === undefined ? null : <DemoAccountsForm demo={demo} />}
            <AuthForm kind="signIn" action={requestSignIn} />
          </div>
        ) : (
          <CodeStep page="signIn" />
        )
      }
      other={{ question: t('switch'), action: t('switchAction'), href: routes.signUp }}
      aside={{ title: t('aside.title'), lead: t('aside.lead'), children: <ShopToday /> }}
    />
  )
}
