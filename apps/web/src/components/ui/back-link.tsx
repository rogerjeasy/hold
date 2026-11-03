import { ArrowLeft } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { Link } from '@/i18n/navigation'

// The way back up from a page that sits under another, such as a rental's claim under the rental: quiet, so the page's
// own action stays the one that stands out.
export function BackLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        'group inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 rounded-xl px-3 text-[0.9375rem] font-semibold text-muted-foreground transition-colors duration-200 ease-swift hover:bg-foreground/6 hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 ease-swift group-hover:-translate-x-0.5" />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  )
}
