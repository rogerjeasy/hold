import { useTranslations } from 'next-intl'
import { ShopToday } from '@/features/marketing/shop-today'
import { routes } from '@/lib/routes'
import { requestSignIn } from './actions'
import { AuthForm } from './auth-form'
import { AuthShell } from './auth-shell'
import { CodeStep } from './code-step'

// `codeSentTo` is the address a code went to, once the form was sent. The page then asks for the code.
export function SignInScreen({ codeSentTo }: { codeSentTo?: string | undefined }) {
  const t = useTranslations('auth.signIn')
  const code = useTranslations('auth.code')

  return (
    <AuthShell
      title={codeSentTo === undefined ? t('title') : code('title')}
      lead={codeSentTo === undefined ? t('lead') : code('lead', { email: codeSentTo })}
      form={codeSentTo === undefined ? <AuthForm kind="signIn" action={requestSignIn} /> : <CodeStep page="signIn" />}
      other={{ question: t('switch'), action: t('switchAction'), href: routes.signUp }}
      aside={{ title: t('aside.title'), lead: t('aside.lead'), children: <ShopToday /> }}
    />
  )
}
