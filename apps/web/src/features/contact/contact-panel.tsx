'use client'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { useRouter } from '@/i18n/navigation'
import { ChangeStep } from './change-step'
import { ContactSummary } from './contact-summary'
import type { RenterContactView } from './contact-view'
import { PhoneConfirmForm } from './phone-confirm-form'
import { PhoneForm } from './phone-form'
import type { PhoneCodeSent } from './phone-form'
import { ShownText } from './shown-text'

type Step = { readonly kind: 'summary' } | { readonly kind: 'choosing' } | { readonly kind: 'changing' } | { readonly kind: 'confirming'; readonly phone: string; readonly shown: string | null } | { readonly kind: 'done'; readonly phone: string }

// How Hold reaches the renter, chosen on their own phone (architecture.md section 12.3): by email, or by text to a
// number they confirm with a code. Before the hold is placed they set it freely; after, a new number first needs a code
// from the channel trusted now.
export function ContactPanel({ token, contact }: { token: string; contact: RenterContactView }) {
  const t = useTranslations('contact')
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: 'summary' })
  const onSent = useCallback((sent: PhoneCodeSent) => {
    if (!sent.confirmed) {
      setStep({ kind: 'confirming', phone: sent.phone, shown: sent.shown })
      return
    }
    setStep({ kind: 'done', phone: sent.phone })
    router.refresh()
  }, [router])
  const onConfirmed = useCallback((phone: string) => {
    setStep({ kind: 'done', phone })
    router.refresh()
  }, [router])
  const settled = step.kind === 'summary' || step.kind === 'done'
  return (
    <Panel title={t('title')}>
      <div className="grid min-w-0 gap-4 p-4 md:p-5">
        {settled ? <ContactSummary token={token} contact={contact} onChange={() => { setStep(contact.locked ? { kind: 'changing' } : { kind: 'choosing' }) }} /> : null}
        {step.kind === 'done' ? <p role="status" className="font-semibold">{t('confirmedNow', { phone: step.phone })}</p> : null}
        {step.kind === 'choosing' ? <PhoneForm token={token} changing={false} onSent={onSent} /> : null}
        {step.kind === 'changing' ? <ChangeStep token={token} onSent={onSent} /> : null}
        {step.kind === 'confirming' ? <PhoneConfirmForm token={token} phone={step.phone} shown={step.shown} onConfirmed={onConfirmed} /> : null}
        {settled ? null : (
          <Button type="button" variant="ghost" onClick={() => { setStep({ kind: 'summary' }) }} className="min-h-11 justify-self-start">{t('cancel')}</Button>
        )}
        {settled && contact.shown.length > 0 ? <div className="grid gap-4 border-t pt-4">{contact.shown.map((text) => <ShownText key={text.id} body={text.body} />)}</div> : null}
      </div>
    </Panel>
  )
}
