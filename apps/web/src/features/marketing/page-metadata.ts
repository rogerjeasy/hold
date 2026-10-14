import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import type { RouteKey } from '@/lib/routes'

// Each public page names itself in the reader's language. The home page keeps the full site title.
export function pageMetadata(key: RouteKey): () => Promise<Metadata> {
  return async () => {
    const t = await getTranslations('meta')
    return key === 'home'
      ? { title: { absolute: t('home.title') }, description: t('home.description') }
      : { title: t(`${key}.title`), description: t(`${key}.description`) }
  }
}
