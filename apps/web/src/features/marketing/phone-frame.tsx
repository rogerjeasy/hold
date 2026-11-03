import { cn } from 'cn'
import { useId, type ReactNode } from 'react'

// A phone drawn around a screen: a dark body with its buttons, a rounded screen and the camera's island. It stays dark
// in both themes, as a phone does. The screen inside is an illustration.
export function PhoneFrame({ caption, className, children }: { caption: string; className?: string; children: ReactNode }) {
  const captionId = useId()

  return (
    <figure aria-labelledby={captionId} className={cn('w-full max-w-device', className)}>
      <figcaption id={captionId} className="label mb-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
        {caption}
      </figcaption>
      <div className="relative rounded-device bg-band p-2 shadow-overlay ring-1 ring-foreground/10">
        <span aria-hidden="true" className="absolute top-24 -left-0.5 h-8 w-0.5 rounded-l-full bg-band-border" />
        <span aria-hidden="true" className="absolute top-36 -left-0.5 h-12 w-0.5 rounded-l-full bg-band-border" />
        <span aria-hidden="true" className="absolute top-32 -right-0.5 h-16 w-0.5 rounded-r-full bg-band-border" />
        <div className="relative flex min-h-112 flex-col gap-2.5 overflow-hidden rounded-screen bg-card px-3.5 pt-10 pb-4 text-sm leading-snug text-card-foreground">
          <span aria-hidden="true" className="absolute top-2.5 left-1/2 h-5.5 w-22 -translate-x-1/2 rounded-full bg-band" />
          {children}
        </div>
      </div>
    </figure>
  )
}
