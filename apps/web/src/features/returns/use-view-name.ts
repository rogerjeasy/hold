import { useViewLabel } from '@/features/trust/use-view-label'

// A view's name in words on the comparison page: the shop's own name from the photo plan, Hold's for the views no plan
// has (a renter's extra photograph, the drop point), and, for a key no plan names, the key read as words, so a heading
// never shows "frame-drive-side" (audit finding F-M9).
export function useViewName(labels: Readonly<Record<string, string>>): (view: string) => string {
  const named = useViewLabel()
  return (view) => {
    const label = named({ view, label: labels[view] ?? null })
    if (label !== view) return label
    const words = view.replace(/[-_]+/g, ' ').trim()
    return words === '' ? view : `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}`
  }
}
