'use client'
import { MessageSquare } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { codeInText, fillCode } from './fill-code'

// A text a demo shop showed here instead of sending (architecture.md section 12.3), labelled so it is never read as
// sent. When it carries a code and the page has a field for it, one tap fills it in, as a phone would.
export function ShownText({ body, codeInputId }: { body: string; codeInputId?: string }) {
  const t = useTranslations('contact')
  const code = codeInText(body)
  const captionId = useId()
  return (
    <figure aria-labelledby={captionId} className="grid max-w-md min-w-0 gap-2">
      <figcaption id={captionId} className="label flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageSquare aria-hidden="true" className="size-3.5 shrink-0" />
        {t('shownLabel')}
      </figcaption>
      <p className="rounded-2xl rounded-bl-sm border bg-muted px-4 py-3 text-[0.9375rem] whitespace-pre-wrap wrap-long-words">{body}</p>
      {code === undefined || codeInputId === undefined ? null : (
        <Button type="button" variant="outline" className="min-h-11 justify-self-start" onClick={() => { fillCode(codeInputId, code) }}>
          {t('useCode', { code })}
        </Button>
      )}
    </figure>
  )
}
