import { pageMetadata } from '@/features/marketing/page-metadata'
import { ForShopsScreen } from '@/features/marketing/screens/for-shops-screen'

export const generateMetadata = pageMetadata('forShops')

export default function Page() {
  return <ForShopsScreen />
}
