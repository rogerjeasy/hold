'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeSent } from '@/features/contact/code-sent'
import { useCodeSender } from '@/features/contact/use-code-sender'
import { RenterMessage } from '@/features/renter/renter-message'
import { useRouter } from '@/i18n/navigation'
import { agreeIncidentPrice, leaveIncidentToReturn, sendIncidentCode } from './renter-actions'

// Agreeing the published price a staff member confirmed, with the one-time code used for every money decision, or
// leaving it for the return. Nothing is charged either way.
export function IncidentAgreeForm({ token, incidentId, price }: { token: string; incidentId: string; price: string }) {
  const t = useTranslations('renter.incident.agree')
  const locale = useLocale()
  const router = useRouter()
  const code = useCodeSender(sendIncidentCode, { token, locale, incidentId })
  const [agreed, agree, agreeing] = useActionState(agreeIncidentPrice, null)
  const [left, leave, leaving] = useActionState(leaveIncidentToReturn, null)
  useEffect(() => {
    if (agreed?.ok === true || left?.ok === true) router.refresh()
  }, [agreed, left, router])
  const wording = { code_expired: t('codeExpired'), wrong_code: t('wrongCode'), code_recently_sent: t('codeRecentlySent'), email_unavailable: t('emailUnavailable') }
  const hidden = <><input type="hidden" name="token" value={token} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="incidentId" value={incidentId} /></>
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p>{t('codeGuidance', { price })}</p>
        <Button type="button" onClick={code.send} disabled={code.pending} className="min-h-12 justify-self-start whitespace-normal">{t('sendCode')}</Button>
        <CodeSent result={code.result} pending={code.pending} onEmailInstead={code.sendByEmail} codeInputId="incident-code" emailWords={{ sent: t('codeSent'), sandbox: t('codeSentSandbox') }} wording={wording} />
      </div>
      <form action={agree} className="grid gap-3">
        {hidden}
        <Label htmlFor="incident-code">{t('code')}</Label>
        <Input id="incident-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} className="max-w-48" />
        <Button type="submit" disabled={agreeing} className="min-h-12 justify-self-start whitespace-normal">{t('agree', { price })}</Button>
        <RenterMessage result={agreed?.ok === true ? null : agreed} wording={wording} />
      </form>
      <form action={leave} className="grid gap-3">
        {hidden}
        <p className="text-muted-foreground">{t('leaveGuidance')}</p>
        <Button type="submit" variant="outline" disabled={leaving} className="min-h-12 justify-self-start whitespace-normal">{t('leave')}</Button>
        <RenterMessage result={left?.ok === true ? null : left} />
      </form>
    </div>
  )
}
