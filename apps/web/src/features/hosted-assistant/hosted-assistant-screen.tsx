import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { HostedChat } from './hosted-chat'

// A public page where anyone can talk to an assistant that rents through Hold's MCP server, as a renter's own assistant
// would (extensions.md section 8.10). It is a demonstration and says so; the address beside it lets a judge connect
// their own assistant instead. canAskAboutBooking: this browser's demo shop has a booking the assistant may look up.
export function HostedAssistantScreen({ mcpUrl, canAskAboutBooking = false }: { mcpUrl: string; canAskAboutBooking?: boolean }) {
  const t = useTranslations('hostedAssistant')
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid animate-rise gap-3">
        <p className="label text-xs text-muted-foreground">{t('label')}</p>
        <h1 className="text-page-title text-balance">{t('title')}</h1>
        <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
        <p className="max-w-prose rounded-2xl bg-primary/8 px-4 py-3 text-pretty">{t('demonstration')}</p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <HostedChat canAskAboutBooking={canAskAboutBooking} />
        <Panel title={t('connectTitle')}>
          <div className="grid gap-3 px-4 py-3 md:px-5">
            <p className="text-pretty">{t('connectBody')}</p>
            <code className="block rounded-xl bg-muted px-3.5 py-2.5 font-mono text-sm break-all">{mcpUrl}</code>
            <p className="text-sm text-pretty text-muted-foreground">{t('connectNote')}</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
