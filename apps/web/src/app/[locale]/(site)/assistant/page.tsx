import { HostedAssistantScreen } from '@/features/hosted-assistant/hosted-assistant-screen'
import { pageMetadata } from '@/features/marketing/page-metadata'
import { getServices } from '@/server/services'

export const generateMetadata = pageMetadata('assistant')

// The address is this deployment's own, read when the page is served.
export const dynamic = 'force-dynamic'

export default async function Page() {
  return <HostedAssistantScreen mcpUrl={new URL('/mcp', (await getServices()).config.publicUrl).toString()} />
}
