import { NotFoundView } from '@/features/site/not-found-view'
import { SiteFrame } from '@/features/site/site-frame'

export default function NotFound() {
  return (
    <SiteFrame>
      <NotFoundView />
    </SiteFrame>
  )
}
