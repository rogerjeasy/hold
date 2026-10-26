import { Bot } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { assistantState } from './assistant-state'

// On the renter's own rental page: an assistant is connected, with a way to see what it did and to stop it
// (extensions.md section 8.5).
export function AssistantNotice({ token, assistant }: { token: string; assistant: { readonly connected: boolean; readonly revoked: boolean } }) {
  const t = useTranslations('renter.assistant')
  return (
    <div className="grid max-w-prose gap-1 border-l-2 border-primary pl-3">
      <p className="flex items-center gap-2 font-semibold">
        <Bot aria-hidden="true" className="size-4.5 shrink-0 text-primary" />
        {t(`title.${assistantState(assistant)}`)}
      </p>
      <Link href={linkRoutes.assistant(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
        {t('link')}
      </Link>
    </div>
  )
}
