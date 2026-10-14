import { pageMetadata } from '@/features/marketing/page-metadata'
import { AiScreen } from '@/features/marketing/screens/ai-screen'

export const generateMetadata = pageMetadata('ai')

export default function Page() {
  return <AiScreen />
}
