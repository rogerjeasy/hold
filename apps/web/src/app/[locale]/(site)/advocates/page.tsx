import { pageMetadata } from '@/features/marketing/page-metadata'
import { AdvocatesScreen } from '@/features/marketing/screens/advocates-screen'

export const generateMetadata = pageMetadata('advocates')

export default function Page() {
  return <AdvocatesScreen />
}
