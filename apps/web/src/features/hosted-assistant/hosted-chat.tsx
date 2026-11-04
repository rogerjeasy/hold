'use client'

import type { Conversation } from '@hold/mcp'
import { CalendarCheck, CircleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useId, useOptimistic, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { askAssistant } from './actions'
import { ApprovalPanel } from './approval-panel'
import { ChatTranscript } from './chat-transcript'
import { WorkingStatus } from './working-status'

type Answer = Awaited<ReturnType<typeof askAssistant>>

const PROBLEMS = ['ceiling', 'refused', 'unavailable', 'no_booking', 'already_followed'] as const
const asked = (current: Conversation, text: string): Conversation => [...current, { role: 'user', content: [{ type: 'text', text }] }]

// The conversation with the hosted assistant. The page keeps the exchange and sends it back with each message; the
// assistant's every tool call still goes through Hold's gateway on the server. The person's words show at once, and
// how long the answer has taken while it is on its way. canAskAboutBooking: the demo shop has a booking of its own
// that the assistant may look up, once, for this conversation.
export function HostedChat({ canAskAboutBooking = false }: { canAskAboutBooking?: boolean }) {
  const t = useTranslations('hostedAssistant')
  const locale = useLocale()
  const fieldId = useId()
  const [conversation, setConversation] = useState<Conversation>([])
  const [shown, addAsked] = useOptimistic(conversation, asked)
  const [lookedUp, setLookedUp] = useState(false)
  const [answer, ask, pending] = useActionState(async (previous: Answer | null, data: FormData) => {
    const text = data.get('text')
    if (typeof text === 'string' && text.trim() !== '') addAsked(text.trim())
    if (data.get('lookup') !== null) setLookedUp(true)
    const result = await askAssistant(previous, data)
    if (result.ok) setConversation(result.value.conversation)
    return result
  }, null)
  const turn = answer?.ok === true ? answer.value : null
  const problem = PROBLEMS.find((each) => each === turn?.stopped)
  const hidden = (
    <>
      <input type="hidden" name="conversation" value={JSON.stringify(conversation)} />
      <input type="hidden" name="locale" value={locale} />
    </>
  )
  return (
    <section aria-label={t('chat')} className="grid min-w-0 gap-4">
      <ChatTranscript conversation={shown} simulated={turn?.simulated ?? false} />
      {pending ? <WorkingStatus /> : null}
      {problem === undefined ? null : <Problem text={t(`stopped.${problem}`)} />}
      {answer?.ok === false ? <Problem text={t(`results.${answer.failure}`)} /> : null}
      {turn?.approvalUrl == null ? null : <ApprovalPanel url={turn.approvalUrl} qr={turn.approvalQr} />}
      {canAskAboutBooking && !lookedUp && !pending ? (
        <form action={ask}>
          {hidden}
          <input type="hidden" name="text" value={t('askBookingQuestion')} />
          <input type="hidden" name="lookup" value="latest_booking" />
          <Button type="submit" variant="outline" disabled={pending}>
            <CalendarCheck aria-hidden="true" />
            {t('askBooking')}
          </Button>
        </form>
      ) : null}
      <form action={ask} className="grid gap-2">
        {hidden}
        <label htmlFor={fieldId} className="font-semibold">
          {t('message')}
        </label>
        <textarea id={fieldId} name="text" required maxLength={1000} rows={3} placeholder={t('placeholder')} onKeyDown={sendOnEnter(pending)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-base" />
        <Button type="submit" className="min-h-12 justify-self-start" disabled={pending}>
          {pending ? t('sending') : t('send')}
        </Button>
      </form>
    </section>
  )
}

// Enter sends, as in any chat; Shift+Enter starts a new line, and a word still being composed is left alone. While a
// message is on its way, Enter sends nothing more.
const sendOnEnter = (pending: boolean) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
  event.preventDefault()
  if (!pending) event.currentTarget.form?.requestSubmit()
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
      {text}
    </p>
  )
}
