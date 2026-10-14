import type { InvitationForLink } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { routes } from '@/lib/routes'
import { requestInvitationCode } from './actions'
import { AuthForm } from './auth-form'
import { AuthShell } from './auth-shell'
import { CodeStep } from './code-step'

type InvitationScreenProps = {
  token: string
  invitation: InvitationForLink | undefined
  // The address a code went to, once the person asked for one.
  codeSentTo: string | undefined
}

// Where an invitation email leads. The code goes to the address the shop invited, never one the visitor types.
export function InvitationScreen({ token, invitation, codeSentTo }: InvitationScreenProps) {
  const t = useTranslations('auth.invite')
  const code = useTranslations('auth.code')
  const roles = useTranslations('shop.staff.roles')
  const open = invitation?.state === 'open'

  const title = codeSentTo !== undefined ? code('title') : open ? t('title', { shop: invitation.shopName }) : t('closed.title')
  const lead =
    codeSentTo !== undefined ? code('lead', { email: codeSentTo }) : open ? t('lead', { role: roles(invitation.role), email: invitation.email }) : t('closed.lead')

  return (
    <AuthShell
      title={title}
      lead={lead}
      form={
        codeSentTo !== undefined ? (
          <CodeStep page="invite" />
        ) : open ? (
          <AuthForm kind="invite" action={requestInvitationCode} hidden={{ token }} />
        ) : (
          <Notice title={t(`closed.${invitation?.state ?? 'missing'}`)} body={t('closed.body')} />
        )
      }
      other={{ question: t('switch'), action: t('switchAction'), href: routes.signIn }}
      aside={{ title: t('aside.title'), lead: t('aside.lead'), children: null }}
    />
  )
}
