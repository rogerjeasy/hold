'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { RenterMessage } from '@/features/renter/renter-message'
import { confirmSettlement, sendSettlementCode } from './renter-actions'
import { useResultWording } from './use-result-wording'

// The renter's final tap (extensions.md section 9.9): a fresh one-time code, then confirm or decline the amount agreed.
export function SettlementConfirmForm({ token, agreed }: { token: string; agreed: string }) {
  const t = useTranslations('negotiation.confirm')
  const locale = useLocale()
  const wording = useResultWording()
  const [sent, send, sending] = useActionState(sendSettlementCode, null)
  const [decided, decide, deciding] = useActionState(confirmSettlement, null)
  return (
    <Panel title={t('renterTitle')}>
      <div className="grid gap-4 p-4 md:p-5">
        <p className="text-lg font-semibold">{agreed}</p>
        <p>{t('renterGuidance')}</p>
        <form action={send} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <Button disabled={sending} className="min-h-12 justify-self-start whitespace-normal">{t('sendCode')}</Button>
          {sent?.ok === true ? <p role="status">{t(sent.value.sandboxContact ? 'codeSentSandbox' : 'codeSent')}</p> : null}
          <RenterMessage result={sent} wording={wording} />
        </form>
        <form action={decide} className="grid gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <Label htmlFor="settlement-code">{t('code')}</Label>
          <Input id="settlement-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} className="sm:max-w-xs" />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="decision" value="confirm" disabled={deciding} className="min-h-12 whitespace-normal">{t('confirm')}</Button>
            <Button type="submit" name="decision" value="decline" variant="outline" disabled={deciding} className="min-h-12 whitespace-normal">{t('decline')}</Button>
          </div>
          {decided?.ok === true ? <p role="status">{t('done')}</p> : null}
          <RenterMessage result={decided} wording={wording} />
        </form>
      </div>
    </Panel>
  )
}
