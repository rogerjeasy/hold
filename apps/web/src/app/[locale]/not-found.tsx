import { NotFoundView } from '@/features/site/not-found-view'
import { notFoundMetadata } from '@/features/site/not-found-metadata'
import { SiteFrame } from '@/features/site/site-frame'

export const generateMetadata = notFoundMetadata

export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundView />
    </SiteFrame>
  )
}
