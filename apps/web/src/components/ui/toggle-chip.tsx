import { cn } from 'cn'

// One choice in a row of filters: a pill that stays pressed while its filter holds, with how many it holds beside its
// name. Pressed reads in words to a screen reader (aria-pressed) and by its ink fill to the eye, never by colour alone.
export function ToggleChip({ pressed, onPress, label, count }: { pressed: boolean; onPress: () => void; label: string; count?: number | undefined }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        'inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-swift active:scale-[0.97]',
        pressed ? 'border-contrast bg-contrast text-contrast-foreground shadow-card' : 'border-border bg-card text-foreground shadow-xs hover:border-border-strong',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count === undefined ? null : (
        <>
          {' '}
          <span className={cn('figures grid h-5.5 min-w-5.5 place-items-center rounded-full px-1.5 text-xs', pressed ? 'bg-contrast-foreground/18' : 'bg-muted text-muted-foreground')}>{count}</span>
        </>
      )}
    </button>
  )
}
