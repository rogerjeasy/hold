import { pageMetadata } from '@/features/marketing/page-metadata'
import { HowItWorksScreen } from '@/features/marketing/screens/how-it-works-screen'

export const generateMetadata = pageMetadata('howItWorks')

export default function Page() {
  return <HowItWorksScreen />
}
