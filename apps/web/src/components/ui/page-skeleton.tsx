import { useTranslations } from 'next-intl'
import { Skeleton } from './skeleton'

// What a page shows while its data is on the way: its heading and its cards as soft shapes, so the page never goes
// blank and nothing jumps when the content arrives. Screen readers hear that the page is loading.
export function PageSkeleton() {
  const t = useTranslations('loading')
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-app animate-fade px-4 pt-6 pb-14 md:px-8 md:pt-9 lg:px-10">
      <span className="sr-only">{t('page')}</span>
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="mt-4 h-10 w-full max-w-md" />
      <Skeleton className="mt-3 h-5 w-full max-w-sm" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((each) => (
          <div key={each} className="surface grid gap-3 p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="surface grid gap-4 p-5">
          {[0, 1, 2, 3, 4].map((each) => (
            <div key={each} className="flex items-center gap-4">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3.5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="surface grid content-start gap-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  )
}
