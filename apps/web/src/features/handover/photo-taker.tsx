'use client'

import { checkPhotoQuality } from '@hold/domain'
import type { PhotoMeasures, PhotoProblem, ViewOutline } from '@hold/domain'
import { Camera, FlaskConical, ImageUp, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { OutlineOverlay } from './outline-overlay'
import { readFrame, readImage } from './read-image'
import type { ReadImage } from './read-image'
import { useCamera } from './use-camera'
import { useQualityCheck } from './use-quality-check'

type View = { readonly key: string; readonly label: string; readonly outline: ViewOutline }
type Step = { readonly kind: 'ready' } | { readonly kind: 'checking' } | { readonly kind: 'uploading'; readonly share: number } | { readonly kind: 'retake'; readonly problems: readonly PhotoProblem[] } | { readonly kind: 'failed'; readonly reason: string }

// When the photograph could not be measured, it is taken as it is: the comparison checks quality again later.
const UNMEASURED: PhotoMeasures = { sharpness: 0, shadows: 0, highlights: 0, filled: 0 }
// The demonstration's sample, said to be one on screen (AGENTS.md section 9).
const SAMPLE = '/images/sample-handover.jpg'

// Puts a checked photograph where it belongs: staff's handover, or what a renter adds to the condition report.
export type UploadTaken = (blob: Blob, measures: PhotoMeasures, onProgress: (share: number) => void, simulated?: boolean) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>

// Takes one view's photograph (architecture.md section 9.1): the camera with the view's outline, a file when there is no
// camera, or the sample. The phone checks it at once and asks for a retake before anything uploads.
export function PhotoTaker({ view, upload, onTaken, guide }: { view: View; upload: UploadTaken; onTaken: () => void; guide?: string }) {
  const t = useTranslations('shop.handover.taker')
  const check = useQualityCheck()
  const camera = useCamera(true)
  const [step, setStep] = useState<Step>({ kind: 'ready' })

  const take = async (read: () => Promise<ReadImage>, simulated = false) => {
    setStep({ kind: 'checking' })
    const image = await read()
    const measures = await check(image.pixels)
    const problems = measures === undefined ? [] : checkPhotoQuality(measures)
    if (problems.length > 0) {
      setStep({ kind: 'retake', problems })
      return
    }
    setStep({ kind: 'uploading', share: 0 })
    const uploaded = await upload(image.blob, measures ?? UNMEASURED, (share) => {
      setStep({ kind: 'uploading', share })
    }, simulated)
    if (uploaded.ok) {
      setStep({ kind: 'ready' })
      onTaken()
    } else setStep({ kind: 'failed', reason: uploaded.reason })
  }
  const busy = step.kind === 'checking' || step.kind === 'uploading'

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
        <video ref={camera.video} playsInline muted aria-label={t('camera', { view: view.label })} className="size-full object-contain" />
        {guide === undefined ? null : <img src={guide} alt={t('guide', { view: view.label })} className="pointer-events-none absolute inset-0 size-full object-contain opacity-40" />}
        <OutlineOverlay outline={view.outline} />
        {camera.state === 'unavailable' ? <p className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-sm text-white">{t('noCamera')}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-12" disabled={busy || camera.state !== 'live'} onClick={() => { const video = camera.video.current; if (video !== null) void take(() => readFrame(video)) }}>
          <Camera aria-hidden="true" />
          {t('take')}
        </Button>
        <Button asChild variant="outline" className="min-h-12">
          <label>
            <ImageUp aria-hidden="true" />
            {t('file')}
            <input type="file" accept="image/jpeg" capture="environment" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void take(() => readImage(file)) }} />
          </label>
        </Button>
        <Button type="button" variant="ghost" className="min-h-12" disabled={busy} onClick={() => { void take(async () => readImage(await (await fetch(SAMPLE)).blob()), true) }}>
          <FlaskConical aria-hidden="true" />
          {t('sample')}
        </Button>
      </div>
      {busy ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4.5 shrink-0 animate-spin" />
          {step.kind === 'uploading' ? t('uploading', { percent: Math.round(step.share * 100) }) : t('checking')}
        </p>
      ) : null}
      {step.kind === 'retake' ? <p role="alert" className="text-destructive">{t('retake', { problems: step.problems.map((problem) => t(`problems.${problem}`)).join(', ') })}</p> : null}
      {step.kind === 'failed' ? <p role="alert" className="text-destructive">{t('failed')}</p> : null}
    </div>
  )
}
