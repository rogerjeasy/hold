import { useTranslations } from 'next-intl'

// Who argues the renter's contest (extensions.md section 9.11): Hold's advocate, or the assistant the renter connected
// to this rental. The assistant's name is its own, shown as not verified. Offered only while an assistant is connected.
export function AdvocateChoice({ assistantName }: { assistantName: string }) {
  const t = useTranslations('negotiation.advocate')
  return (
    <fieldset className="grid gap-3">
      <legend className="font-semibold">{t('who')}</legend>
      <label className="flex min-h-11 items-start gap-3">
        <input type="radio" name="advocate" value="hold" defaultChecked className="min-h-11 min-w-11 shrink-0 accent-primary" />
        <span className="self-center text-pretty">{t('hold')}</span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input type="radio" name="advocate" value="assistant" className="min-h-11 min-w-11 shrink-0 accent-primary" />
        <span className="min-w-0 self-center text-pretty wrap-long-words">{t('assistant', { name: assistantName })}</span>
      </label>
      <p className="max-w-prose text-sm text-muted-foreground">{t('assistantGuidance')}</p>
    </fieldset>
  )
}
