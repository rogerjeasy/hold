import { pageMetadata } from '@/features/marketing/page-metadata'
import { DemoScreen } from '@/features/marketing/screens/demo-screen'

export const generateMetadata = pageMetadata('demo')

export default function Page() {
  return <DemoScreen />
}
