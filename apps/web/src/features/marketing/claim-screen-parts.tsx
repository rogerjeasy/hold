import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { EvidenceMarks } from './evidence-marks'
import { evidencePhoto } from './evidence-photo'
import { PhotoCrop } from './photo-crop'

export function ScreenHeader({ left, right }: { left: string; right: string }) {
  return (
    <p className="label flex justify-between gap-2 text-xs text-muted-foreground">
      <span>{left}</span>
      <span>{right}</span>
    </p>
  )
}

function Thumbnail({ src, label, marked }: { src: string; label: string; marked: boolean }) {
  const t = useTranslations('evidence')

  return (
    <div className="relative aspect-thumbnail overflow-hidden rounded-lg bg-photo">
      <PhotoCrop viewBox={evidencePhoto.thumbnailViewBox} src={src}>
        {marked ? <EvidenceMarks showNew newLabel={t('newTag')} /> : null}
      </PhotoCrop>
      <span className="figures absolute bottom-1 left-1 rounded-md bg-photo-scrim px-1.5 py-0.5 text-xs text-photo-foreground backdrop-blur-sm">{label}</span>
    </div>
  )
}

export function PhotoPair() {
  const t = useTranslations('bothSides.photo')

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Thumbnail src={evidencePhoto.handoverSrc} label={t('handover')} marked={false} />
      <Thumbnail src={evidencePhoto.returnSrc} label={t('return')} marked />
    </div>
  )
}

type FindingRowProps = {
  kind: 'new' | 'old'
  title: string
  amount: string
  note: string
}

export function FindingRow({ kind, title, amount, note }: FindingRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
      <span
        aria-hidden="true"
        className={cn('size-3', kind === 'new' ? 'rounded-xs border-2 border-primary' : 'rounded-xs border-[1.5px] border-dashed border-muted-foreground')}
      />
      <span className="min-w-0 font-semibold">{title}</span>
      <span className="font-semibold">{amount}</span>
      <span className="col-span-2 col-start-2 text-[0.8125rem] text-muted-foreground">{note}</span>
    </div>
  )
}

// A picture of a button. The screens are illustrations, so nothing in them can be pressed.
export function ScreenAction({ variant, children }: { variant: 'primary' | 'outline'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex min-h-10 items-center justify-center rounded-xl border px-2 text-center font-semibold',
        variant === 'primary' ? 'border-transparent bg-primary text-primary-foreground shadow-glow' : 'border-border-strong bg-card shadow-xs',
      )}
    >
      {children}
    </span>
  )
}
