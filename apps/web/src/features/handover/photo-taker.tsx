'use client'

import { checkPhotoQuality } from '@hold/domain'
import type { DeclaredPhotoSource, PhotoMeasures, PhotoProblem, ViewOutline } from '@hold/domain'
import { Camera, FlaskConical, ImageUp, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { GHOST_STRENGTH, GhostControls } from './ghost-controls'
import { OutlineOverlay } from './outline-overlay'
import { readFrame, readImage } from './read-image'
import type { ReadImage } from './read-image'
import { useCamera } from './use-camera'
import { useQualityCheck } from './use-quality-check'

type View = { readonly key: string; readonly label: string; readonly outline: ViewOutline }
type Step = { readonly kind: 'ready' } | { readonly kind: 'checking' } | { readonly kind: 'uploading'; readonly share: number } | { readonly kind: 'retake'; readonly problems: readonly PhotoProblem[] } | { readonly kind: 'failed'; readonly reason: string }

// When the photograph could not be measured, it is taken as it is: the comparison checks quality again later.
const UNMEASURED: PhotoMeasures = { sharpness: 0, shadows: 0, highlights: 0, filled: 0 }
// The demonstration's samples, said to be ones on screen (AGENTS.md section 9): the frame as handed over, and for a
// return the same frame with a chip in the paint, or with the handover's faint scuff grown into a scratch through the
// paint, which either side can argue about.
const SAMPLE = '/images/sample-handover.jpg'
const RETURN_SAMPLES = [
  { label: 'sampleDamage', source: '/images/sample-return-damage.jpg' },
  { label: 'sampleContested', source: '/images/sample-return-contested.jpg' },
] as const

// Puts a checked photograph where it belongs: staff's handover, or what a renter adds to the condition report.
export type UploadTaken = (blob: Blob, measures: PhotoMeasures, source: DeclaredPhotoSource, onProgress: (share: number) => void) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>

// Takes one view's photograph (architecture.md section 9.1): the camera with the view's outline, a file when there is no
// camera, or a sample. The phone checks it at once and asks for a retake before anything uploads. At a return, guide is
// the handover photograph of the view: a ghost over the live camera to match the angle, or, with no camera to lay it
// over, the photograph itself shown whole as the framing guide.
// sample: the demonstration's own photograph for this view, where the frame would not do, such as a drop point.
export function PhotoTaker({ view, upload, onTaken, guide, returnSamples = false, sample = SAMPLE }: { view: View; upload: UploadTaken; onTaken: () => void; guide?: string; returnSamples?: boolean; sample?: string }) {
  const t = useTranslations('shop.handover.taker')
  const check = useQualityCheck()
  const camera = useCamera(true)
  const [step, setStep] = useState<Step>({ kind: 'ready' })
  const [ghostShown, setGhostShown] = useState(true)
  const [ghostStrength, setGhostStrength] = useState<number>(GHOST_STRENGTH.initial)
  const noCamera = camera.state === 'unavailable'

  const take = async (read: () => Promise<ReadImage>, source: DeclaredPhotoSource) => {
    setStep({ kind: 'checking' })
    const image = await read()
    const measures = await check(image.pixels)
    const problems = measures === undefined ? [] : checkPhotoQuality(measures)
    if (problems.length > 0) {
      setStep({ kind: 'retake', problems })
      return
    }
    setStep({ kind: 'uploading', share: 0 })
    const uploaded = await upload(image.blob, measures ?? UNMEASURED, source, (share) => {
      setStep({ kind: 'uploading', share })
    })
    if (uploaded.ok) {
      setStep({ kind: 'ready' })
      onTaken()
    } else setStep({ kind: 'failed', reason: uploaded.reason })
  }
  // A sample uploads byte for byte as a file, so the server knows it by its fingerprint and marks it as one.
  const takeSample = (source: string) => { void take(async () => readImage(await (await fetch(source)).blob()), 'file') }
  const busy = step.kind === 'checking' || step.kind === 'uploading'

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
        <video ref={camera.video} playsInline muted aria-label={t('camera', { view: view.label })} className="size-full object-contain" />
        {guide === undefined || (!ghostShown && !noCamera) ? null : <img src={guide} alt={t('guide', { view: view.label })} style={{ opacity: noCamera ? 1 : ghostStrength / 100 }} className="pointer-events-none absolute inset-0 size-full object-contain" />}
        <OutlineOverlay outline={view.outline} />
        {noCamera && guide === undefined ? <p className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-sm text-white">{t('noCamera')}</p> : null}
      </div>
      {guide !== undefined && noCamera ? <div className="grid gap-1 text-sm"><p>{t('noCamera')}</p><p className="text-muted-foreground">{t('guideNoCamera')}</p></div> : null}
      {guide !== undefined && camera.state === 'live' ? <GhostControls shown={ghostShown} onShown={setGhostShown} strength={ghostStrength} onStrength={setGhostStrength} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-12" disabled={busy || camera.state !== 'live'} onClick={() => { const video = camera.video.current; if (video !== null) void take(() => readFrame(video), 'camera') }}>
          <Camera aria-hidden="true" />
          {t('take')}
        </Button>
        <Button asChild variant="outline" className="min-h-12">
          <label>
            <ImageUp aria-hidden="true" />
            {t('file')}
            <input type="file" accept="image/jpeg" capture="environment" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void take(() => readImage(file), 'file') }} />
          </label>
        </Button>
        <Button type="button" variant="ghost" className="min-h-12" disabled={busy} onClick={() => { takeSample(sample) }}>
          <FlaskConical aria-hidden="true" />
          {t('sample')}
        </Button>
        {returnSamples ? RETURN_SAMPLES.map((sample) => (
          <Button key={sample.source} type="button" variant="ghost" className="min-h-12" disabled={busy} onClick={() => { takeSample(sample.source) }}>
            <FlaskConical aria-hidden="true" />
            {t(sample.label)}
          </Button>
        )) : null}
      </div>
      {busy ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4.5 shrink-0 animate-spin" />
          {step.kind === 'uploading' ? t('uploading', { percent: Math.round(step.share * 100) }) : t('checking')}
        </p>
      ) : null}
      {step.kind === 'retake' ? <p role="alert" className="text-destructive">{t('retake', { problems: step.problems.map((problem) => t(`problems.${problem}`)).join(', ') })}</p> : null}
      {step.kind === 'failed' ? <p role="alert" className="text-destructive">{step.reason === 'photo_reused' ? t('reused') : t('failed')}</p> : null}
    </div>
  )
}
