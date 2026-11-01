'use client'
import { Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { RenterMessage } from '@/features/renter/renter-message'
import { ShownText } from './shown-text'
import { useContactWording } from './use-contact-wording'
import { useWebOtp } from './use-web-otp'

type Delivery = { readonly via: 'text' | 'email'; readonly phone: string | null; readonly sandboxContact: boolean; readonly shown: string | null }
type Result = { readonly ok: true; readonly value: Delivery } | { readonly ok: false; readonly failure: string; readonly reason?: string } | null

type CodeSentProps = {
  result: Result
  pending: boolean
  // Absent where a code can only go where it went.
  onEmailInstead?: () => void
  // The field the code goes in, which the phone or the sandbox text can fill.
  codeInputId: string
  // The flow's own words for a code that went by email.
  emailWords: { readonly sent: string; readonly sandbox: string }
  wording?: Readonly<Record<string, string>>
}

// Where a one-time code went (architecture.md section 12.3): by text to the masked number, or by email in the flow's
// own words. A renter who got it by text, or whose text could not go, may have it sent to their PayPal email instead,
// so nobody is stuck. In a demo shop the text it did not send is shown, labelled.
export function CodeSent({ result, pending, onEmailInstead, codeInputId, emailWords, wording = {} }: CodeSentProps) {
  const t = useTranslations('contact')
  const contactWording = useContactWording()
  const delivery = result?.ok === true ? result.value : undefined
  const textFailed = result?.ok === false && result.failure === 'refused' && result.reason === 'text_unavailable'
  useWebOtp(codeInputId, delivery?.via === 'text' && delivery.shown === null)
  return (
    <div className="grid min-w-0 gap-3">
      {delivery === undefined ? null : (
        <p role="status">{delivery.via === 'text' ? t('codeSentByText', { phone: delivery.phone ?? '' }) : delivery.sandboxContact ? emailWords.sandbox : emailWords.sent}</p>
      )}
      {delivery?.shown == null ? null : <ShownText body={delivery.shown} codeInputId={codeInputId} />}
      {result?.ok === false ? <RenterMessage result={result} wording={{ ...contactWording, ...wording }} /> : null}
      {onEmailInstead !== undefined && (delivery?.via === 'text' || textFailed) ? (
        <Button type="button" variant="outline" disabled={pending} onClick={onEmailInstead} className="min-h-11 justify-self-start whitespace-normal">
          <Mail aria-hidden="true" />
          {t('emailInsteadButton')}
        </Button>
      ) : null}
    </div>
  )
}
