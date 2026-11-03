'use client'
import type { ClaimPromise } from '@hold/db'
import type { ClaimState } from '@hold/domain'
import { KeyRound, Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { Textarea } from '@/components/ui/textarea'
import { CodeSent } from '@/features/contact/code-sent'
import { useCodeSender } from '@/features/contact/use-code-sender'
import { AdvocateForm } from '@/features/negotiation/advocate-form'
import { PromiseBeforeContest } from '@/features/promise/promise-status'
import { RenterMessage } from '@/features/renter/renter-message'
import { sendClaimCode } from './renter-actions'

type Answer = Parameters<typeof RenterMessage>[0]['result']
// Each answer, as the page's useActionState gives it: the page keeps them, as it looks again once one is sent.
type Answering = { readonly result: Answer; readonly send: (data: FormData) => void; readonly pending: boolean }
type ReplyProps = { token: string; shopName: string; currency: string; state: ClaimState; promise: ClaimPromise | null; canAdvocate: boolean; assistantName: string | null; wording: Readonly<Record<string, string>>; accept: Answering; contest: Answering }

// The renter's answer to a claim: a one-time code first, then accept, or contest with their reasons. Both buttons send
// the same form, so the code and the words go with whichever the renter chooses.
export function RenterClaimReply({ token, shopName, currency, state, promise, canAdvocate, assistantName, wording, accept, contest }: ReplyProps) {
  const t = useTranslations('claim')
  const locale = useLocale()
  const code = useCodeSender(sendClaimCode, { token, locale })
  const busy = accept.pending || contest.pending
  return (
    <Panel title={t('yourReply')} icon={KeyRound}>
      <div className="grid gap-6 p-4 md:p-5">
        {promise != null && state === 'presented' ? <PromiseBeforeContest shopName={shopName} days={promise.days} /> : null}
        <div className="grid gap-3 rounded-xl bg-muted/50 p-4">
          <p className="text-pretty">{t('codeGuidance')}</p>
          <Button type="button" variant="outline" onClick={code.send} disabled={code.pending} className="min-h-12 w-full sm:w-auto sm:justify-self-start">
            <Send aria-hidden="true" />
            {t('sendCode')}
          </Button>
          <CodeSent result={code.result} pending={code.pending} onEmailInstead={code.sendByEmail} codeInputId="claim-code" emailWords={{ sent: t('codeSent'), sandbox: t('codeSentSandbox') }} wording={wording} />
        </div>
        <form action={accept.send} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <div className="grid gap-2">
            <Label htmlFor="claim-code">{t('code')}</Label>
            <Input id="claim-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} className="figures max-w-64 text-lg tracking-[0.3em]" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="claim-comment">{t('comment')}</Label>
            <Textarea id="claim-comment" name="comment" maxLength={1000} />
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            <Button type="submit" disabled={busy} className="min-h-12 whitespace-normal">{t('accept')}</Button>
            <Button type="submit" formAction={contest.send} variant="outline" disabled={busy} className="min-h-12 whitespace-normal">{t('contest')}</Button>
          </div>
          <RenterMessage result={accept.result} wording={wording} />
          <RenterMessage result={contest.result} wording={wording} />
        </form>
        {canAdvocate ? <div className="border-t border-border/70 pt-6"><AdvocateForm token={token} currency={currency} assistantName={assistantName} /></div> : null}
      </div>
    </Panel>
  )
}
