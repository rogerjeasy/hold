import type { Conversation } from '@hold/mcp'
import { Bot, User, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'

type Line = { readonly key: string; readonly kind: 'person' | 'assistant' | 'tool'; readonly text: string }

// The chat as the person reads it: what they wrote, what the assistant said, and each Hold tool it used. Tool results
// stay out of sight; they are the assistant's to read.
export function ChatTranscript({ conversation, simulated }: { conversation: Conversation; simulated: boolean }) {
  const t = useTranslations('hostedAssistant')
  const lines = conversation.flatMap((message, index) =>
    message.content.flatMap((block, part): Line[] => {
      const key = `${String(index)}-${String(part)}`
      if (block.type === 'text') return [{ key, kind: message.role === 'user' ? 'person' : 'assistant', text: block.text }]
      if (block.type === 'tool_use') return [{ key, kind: 'tool', text: t('used', { tool: block.name }) }]
      return []
    }),
  )
  if (lines.length === 0) return <p className="text-muted-foreground">{t('empty')}</p>
  return (
    <ol aria-label={t('chat')} className="grid gap-3">
      {lines.map((line) =>
        line.kind === 'tool' ? (
          <li key={line.key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench aria-hidden="true" className="size-3.5 shrink-0" />
            {line.text}
          </li>
        ) : (
          <li key={line.key} className={`grid max-w-prose gap-1 rounded-md border px-3 py-2 ${line.kind === 'person' ? 'justify-self-end bg-muted' : 'justify-self-start'}`}>
            <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted-foreground">
              {line.kind === 'person' ? <User aria-hidden="true" className="size-3.5" /> : <Bot aria-hidden="true" className="size-3.5" />}
              {line.kind === 'person' ? t('you') : t('assistant')}
              {line.kind === 'assistant' && simulated ? <SampleTag label={t('simulated')} /> : null}
            </span>
            <span className="text-pretty whitespace-pre-line wrap-long-words">{line.text}</span>
          </li>
        ),
      )}
    </ol>
  )
}
