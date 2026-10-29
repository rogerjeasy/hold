'use client'
import type { ClaimMessage } from '@hold/db'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'

// The words on a claim, oldest first. The reader's own side sits to the right. Each says who wrote it and when, on
// the shop's clock, so the colour of a bubble is never the only sign of whose it is.
export function MessageThread({ messages, audience, shopName, renterName, timeZone }: { messages: readonly ClaimMessage[]; audience: 'renter' | 'shop'; shopName: string; renterName: string | null; timeZone: string }) {
  const t = useTranslations('promise.messages')
  const format = useShopFormat({ timeZone, currency: null })
  if (messages.length === 0) return <p className="text-muted-foreground">{t('empty')}</p>
  const author = (message: ClaimMessage) => {
    if (message.author === 'renter') return audience === 'renter' ? t('you') : (renterName ?? t('theRenter'))
    const name = message.authorName ?? t('staff')
    return audience === 'renter' ? `${name}, ${shopName}` : name
  }
  return (
    <ol className="grid gap-3">
      {messages.map((message) => {
        const own = (message.author === 'renter') === (audience === 'renter')
        return (
          <li key={message.id} className={`grid max-w-[90%] min-w-0 gap-1 border p-3 ${own ? 'justify-self-end bg-muted' : 'justify-self-start bg-card'}`}>
            <p className="label text-xs text-muted-foreground wrap-long-words">{author(message)} · {format.deadline(message.createdAt)}</p>
            <p className="whitespace-pre-wrap wrap-long-words">{message.body}</p>
          </li>
        )
      })}
    </ol>
  )
}
