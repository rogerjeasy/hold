'use client'

import { LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// While an answer is on its way: how long the assistant has been at it, counted from when the message was sent, and
// why it takes a while. The page cannot see which tool it is calling until the answer comes back, so it does not say.
export function WorkingStatus() {
  const t = useTranslations('hostedAssistant')
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  // The count changes every second, so it is shown, not announced: a screen reader hears the note once.
  return (
    <div role="status" className="grid gap-1 text-[0.9375rem] text-muted-foreground">
      <span aria-hidden="true" className="flex items-center gap-2 font-semibold text-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="tabular-nums">{t('working', { seconds })}</span>
      </span>
      <span className="text-pretty text-sm">{t('workingNote')}</span>
    </div>
  )
}
