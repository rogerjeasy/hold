'use client'

import type { StaffRole } from '@hold/domain'
import { cn } from 'cn'
import { CornerDownLeft, Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'
import { shopNavGroups } from './shop-nav-items'

type Choice = { readonly id: string; readonly group: 'actions' | 'pages'; readonly label: string; readonly href: string; readonly icon: LucideIcon }

// Accents and case do not matter: "cles" finds "Clés".
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Every page of the shop and the one action most started from anywhere, found by typing a few letters. The pages
// themselves still check who may open them; a read-only person is not offered what they may not start.
export function CommandPalette({ role, className }: { role: StaffRole; className?: string }) {
  const t = useTranslations('shell')
  const nav = useTranslations('shop.nav')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const listId = useId()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((was) => !was)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const choices: Choice[] = [
    ...(role === 'read_only' ? [] : [{ id: 'new-rental', group: 'actions' as const, label: t('newRental'), href: rentalRoutes.new, icon: Plus }]),
    ...shopNavGroups.flatMap((group) => group.items.map(({ key, icon }) => ({ id: key, group: 'pages' as const, label: nav(key), href: shopRoutes[key], icon }))),
  ]
  const shown = choices.filter((choice) => folded(choice.label).includes(folded(query.trim())))
  const current = shown[Math.min(active, shown.length - 1)]
  const optionId = (choice: Choice) => `${listId}-${choice.id}`

  function change(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      setActive(0)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((was) => (shown.length === 0 ? 0 : (Math.min(was, shown.length - 1) + step + shown.length) % shown.length))
    } else if (event.key === 'Enter' && current !== undefined) {
      event.preventDefault()
      links.current.get(current.id)?.click()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Trigger
        className={cn(
          'flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-card',
          className,
        )}
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{t('jump.trigger')}</span>
        <kbd aria-hidden="true" className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[max(1rem,12dvh)] left-1/2 z-50 flex max-h-[min(34rem,76dvh)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-overlay duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-96 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-96"
        >
          <Dialog.Title className="sr-only">{t('jump.title')}</Dialog.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search aria-hidden="true" className="size-[1.125rem] shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-label={t('jump.title')}
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={current === undefined ? undefined : optionId(current)}
              autoComplete="off"
              placeholder={t('jump.placeholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              className="min-h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div id={listId} role="listbox" aria-label={t('jump.title')} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {shown.length === 0 ? <p className="px-3 py-8 text-center text-muted-foreground">{t('jump.empty', { query: query.trim() })}</p> : null}
            {(['actions', 'pages'] as const).map((group) => {
              const inGroup = shown.filter((choice) => choice.group === group)
              if (inGroup.length === 0) return null
              return (
                <div key={group} role="group" aria-label={t(`jump.${group}`)} className="not-first:mt-2">
                  <p aria-hidden="true" className="label px-3 pt-2 pb-1.5 text-[0.6875rem] text-muted-foreground">
                    {t(`jump.${group}`)}
                  </p>
                  {inGroup.map((choice) => {
                    const selected = choice === current
                    const Icon = choice.icon
                    return (
                      <Link
                        key={choice.id}
                        id={optionId(choice)}
                        role="option"
                        aria-selected={selected}
                        href={choice.href}
                        tabIndex={-1}
                        ref={(element) => {
                          if (element === null) links.current.delete(choice.id)
                          else links.current.set(choice.id, element)
                        }}
                        onMouseMove={() => {
                          setActive(shown.indexOf(choice))
                        }}
                        onClick={() => {
                          change(false)
                        }}
                        className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors duration-100 aria-selected:bg-primary/10 aria-selected:text-foreground"
                      >
                        <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground', selected && 'border-primary/30 text-primary')}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                        {selected ? <CornerDownLeft aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <p className="hidden border-t bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground sm:block">{t('jump.hint')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
