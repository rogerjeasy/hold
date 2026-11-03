'use client'

import { Check, Copy, ScanLine } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

// A renter link as a code to scan with the renter's phone, with its address to read or copy. The code sits on white in
// both themes, as a phone's camera reads it best.
export function LinkCode({ url, qr, scan }: { url: string; qr: string; scan: string }) {
  const t = useTranslations('shop.rentals.link')
  const [copied, setCopied] = useState(false)
  return (
    <div className="@container w-full min-w-0 animate-pop">
      <figure className="grid min-w-0 gap-4 rounded-2xl border border-border/70 bg-muted/50 p-4 @md:grid-cols-[auto_minmax(0,1fr)] @md:items-center">
        {/* The SVG is drawn on the server from the link alone (server/qr.ts). */}
        <div role="img" aria-label={scan} className="size-48 max-w-full justify-self-center rounded-xl bg-white p-3 shadow-card @md:justify-self-start [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <figcaption className="grid min-w-0 content-center gap-3">
          <span className="flex items-start gap-2 font-semibold">
            <ScanLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
            <span className="min-w-0 wrap-long-words">{scan}</span>
          </span>
          <span data-testid="renter-link" className="figures block max-w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-xs leading-relaxed break-all text-muted-foreground">
            {url}
          </span>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true)
              })
            }}
          >
            {copied ? <Check aria-hidden="true" className="text-success" /> : <Copy aria-hidden="true" />}
            {copied ? t('copied') : t('copy')}
          </Button>
        </figcaption>
      </figure>
    </div>
  )
}
