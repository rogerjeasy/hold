'use client'

import type { Conversation } from '@hold/mcp'
import { CircleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { askAssistant } from './actions'
import { ApprovalPanel } from './approval-panel'
import { ChatTranscript } from './chat-transcript'

type Answer = Awaited<ReturnType<typeof askAssistant>>

// The conversation with the hosted assistant. The page keeps the exchange and sends it back with each message; the
// assistant's every tool call still goes through Hold's gateway on the server.
export function HostedChat() {
  const t = useTranslations('hostedAssistant')
  const locale = useLocale()
  const fieldId = useId()
  const [conversation, setConversation] = useState<Conversation>([])
  const [answer, ask, pending] = useActionState(async (previous: Answer | null, data: FormData) => {
    const result = await askAssistant(previous, data)
    if (result.ok) setConversation(result.value.conversation)
    return result
  }, null)
  const turn = answer?.ok === true ? answer.value : null
  return (
    <section aria-label={t('chat')} className="grid min-w-0 gap-4">
      <ChatTranscript conversation={conversation} simulated={turn?.simulated ?? false} />
      {turn?.stopped === 'ceiling' || turn?.stopped === 'refused' || turn?.stopped === 'unavailable' ? <Problem text={t(`stopped.${turn.stopped}`)} /> : null}
      {answer?.ok === false ? <Problem text={t(`results.${answer.failure}`)} /> : null}
      {turn?.approvalUrl == null ? null : <ApprovalPanel url={turn.approvalUrl} qr={turn.approvalQr} />}
      <form action={ask} className="grid gap-2">
        <input type="hidden" name="conversation" value={JSON.stringify(conversation)} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={fieldId} className="font-semibold">
          {t('message')}
        </label>
        <textarea id={fieldId} name="text" required maxLength={1000} rows={3} placeholder={t('placeholder')} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-base" />
        <Button type="submit" className="min-h-12 justify-self-start" disabled={pending}>
          {pending ? t('sending') : t('send')}
        </Button>
      </form>
    </section>
  )
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {text}
    </p>
  )
}
