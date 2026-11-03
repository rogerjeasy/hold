import { pageMetadata } from '@/features/marketing/page-metadata'
import { TermsScreen } from '@/features/marketing/screens/terms-screen'

export const generateMetadata = pageMetadata('terms')

export default function Page() {
  return <TermsScreen />
}
