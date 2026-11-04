import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

// The title of a page that does not exist. Without one a 404 kept the landing page's in the tab (audit finding JW-L2).
// Both the not-found page and the catch-all route that leads to it give it: the browser takes the title from the
// matched route's own metadata once the page hydrates, so the not-found page's alone was overwritten.
export async function notFoundMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.notFound')
  return { title: t('title'), robots: { index: false, follow: false } }
}
