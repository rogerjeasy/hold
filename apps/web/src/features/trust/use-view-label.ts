import { useTranslations } from 'next-intl'

const MISSED = /^missed-(\d+)$/

// A view's name on /verify: the shop's own name for a planned view, or Hold's for the views no plan has.
export function useViewLabel(): (photo: { readonly view: string; readonly label: string | null }) => string {
  const t = useTranslations('trust.verify.evidence.views')
  return (photo) => {
    if (photo.label !== null) return photo.label
    const missed = MISSED.exec(photo.view)
    if (missed?.[1] !== undefined) return t('missed', { number: missed[1] })
    return photo.view === 'drop-point' ? t('dropPoint') : photo.view
  }
}
