import { pageMetadata } from '@/features/marketing/page-metadata'
import { HomeScreen } from '@/features/marketing/screens/home-screen'

export const generateMetadata = pageMetadata('home')

export default function Page() {
  return <HomeScreen />
}
