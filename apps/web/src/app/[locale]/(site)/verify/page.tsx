import { pageMetadata } from '@/features/marketing/page-metadata'
import { VerifyScreen } from '@/features/trust/verify-screen'
import { credentialKeys } from '@/server/clean-record'

export const generateMetadata = pageMetadata('verify')

// The key is read when the page is served, so a rotated key shows at once.
export const dynamic = 'force-dynamic'

export default async function Page() {
  return <VerifyScreen keys={await credentialKeys()} />
}
