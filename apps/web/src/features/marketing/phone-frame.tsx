import { useId, type ReactNode } from 'react'

export function PhoneFrame({ caption, children }: { caption: string; children: ReactNode }) {
  const captionId = useId()

  return (
    <figure aria-labelledby={captionId} className="w-full max-w-device">
      <figcaption id={captionId} className="label mb-3 text-center text-muted-foreground">
        {caption}
      </figcaption>
      <div className="rounded-device border border-border-strong bg-background p-2 shadow-xl">
        <div className="flex min-h-112 flex-col gap-2.5 rounded-screen border bg-card p-3.5 text-sm leading-snug">{children}</div>
      </div>
    </figure>
  )
}
