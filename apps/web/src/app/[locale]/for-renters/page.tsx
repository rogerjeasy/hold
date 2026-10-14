import { pageMetadata } from '@/features/marketing/page-metadata'
import { ForRentersScreen } from '@/features/marketing/screens/for-renters-screen'

export const generateMetadata = pageMetadata('forRenters')

export default function Page() {
  return <ForRentersScreen />
}
