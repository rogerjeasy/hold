import { cn } from 'cn'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ScreenAction, ScreenHeader } from './claim-screen-parts'
import { evidencePhoto } from './evidence-photo'
import { PhotoCrop } from './photo-crop'
import { capturedViews, currentView, photoPlanKeys } from './photo-plan'

// The corners of the outline that shows staff how to frame the view, in the wheel crop's own frame.
const FRAME_CORNERS = ['M790 220 v-40 h40', 'M1050 180 h40 v40', 'M1090 530 v40 h-40', 'M830 570 h-40 v-40'] as const

// One guided photograph: the outline to fill, the views already taken and the views still to come.
export function CaptureScreen() {
  const t = useTranslations('pages.howItWorks.captureScreen')
  const shop = useTranslations('bothSides.shop')
  const current = photoPlanKeys.indexOf(currentView) + 1

  return (
    <>
      <ScreenHeader left={t('context')} right={shop('item')} />
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold tracking-tight">{t(`views.${currentView}`)}</span>
        <span className="figures text-xs text-muted-foreground">{t('progress', { current, total: photoPlanKeys.length })}</span>
      </p>
      <div className="relative aspect-evidence-tall overflow-hidden rounded-lg bg-photo">
        <PhotoCrop viewBox={evidencePhoto.crops.wheel} src={evidencePhoto.handoverSrc}>
          {FRAME_CORNERS.map((corner) => (
            <path key={corner} d={corner} strokeWidth="4" className="fill-none stroke-photo-foreground" />
          ))}
        </PhotoCrop>
        <span className="figures absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-photo-scrim px-1.5 py-0.5 text-xs text-photo-foreground backdrop-blur-sm">
          <Check aria-hidden="true" className="size-3" />
          {t('hint')}
        </span>
      </div>
      <ol role="list" className="grid grid-cols-6 gap-1">
        {photoPlanKeys.map((key) => {
          const captured = capturedViews[key]
          return (
            <li
              key={key}
              className={cn(
                'relative aspect-square overflow-hidden rounded-md',
                captured ? 'bg-photo' : 'border border-dashed border-border-strong',
                key === currentView && 'border-2 border-solid border-primary',
              )}
            >
              <span className="sr-only">{t(`views.${key}`)}</span>
              {captured ? (
                <>
                  <PhotoCrop viewBox={captured.viewBox} src={evidencePhoto.handoverSrc} className={cn(captured.mirrored && '-scale-x-100')} />
                  <Check aria-hidden="true" className="absolute right-0.5 bottom-0.5 size-3 text-photo-foreground" />
                </>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="mt-auto grid">
        <ScreenAction variant="primary">{t('shutter')}</ScreenAction>
      </div>
    </>
  )
}
