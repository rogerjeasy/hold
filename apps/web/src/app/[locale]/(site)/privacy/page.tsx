import { pageMetadata } from '@/features/marketing/page-metadata'
import { PrivacyScreen } from '@/features/marketing/screens/privacy-screen'

export const generateMetadata = pageMetadata('privacy')

export default function Page() {
  return <PrivacyScreen />
}
