'use client'

import { ClipboardPaste } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// A place to paste a whole price list, from a spreadsheet, a document or an email, on any screen. On a wide screen it
// can also be pasted straight onto the grid.
export function PastePanel({ onPaste, message }: { onPaste: (text: string) => void; message: string | null }) {
  const t = useTranslations('shop.priceEditor.paste')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const id = useId()
  return (
    <div className="grid gap-3">
      <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} className="justify-self-start" onClick={() => { setOpen(!open) }}>
        <ClipboardPaste aria-hidden="true" />
        {t('open')}
      </Button>
      <div id={id} hidden={!open} className="grid animate-rise gap-2 rounded-xl border border-border/70 bg-background/60 p-4">
        <label htmlFor={`${id}-text`} className="font-semibold">{t('label')}</label>
        <p id={`${id}-help`} className="text-sm text-muted-foreground">{t('help')}</p>
        <Textarea id={`${id}-text`} aria-describedby={`${id}-help`} value={text} onChange={(event) => { setText(event.target.value) }} className="min-h-32 font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={text.trim() === ''} onClick={() => { onPaste(text); setText('') }}>{t('add')}</Button>
          <span className="hidden text-sm text-muted-foreground md:inline">{t('gridHint')}</span>
        </div>
      </div>
      <p role="status" className="w-fit rounded-xl bg-muted px-3 py-1.5 text-sm font-semibold empty:hidden">{message ?? ''}</p>
    </div>
  )
}
