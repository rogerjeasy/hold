import { pageMetadata } from '@/features/marketing/page-metadata'
import { PaypalScreen } from '@/features/marketing/screens/paypal-screen'

export const generateMetadata = pageMetadata('paypal')

export default function Page() {
  return <PaypalScreen />
}
