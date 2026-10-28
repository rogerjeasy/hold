import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// jsdom runs no script it is given, so each test plays the browser: it loads or fails the script just appended.
const scripts = () => [...document.head.querySelectorAll('script')]
const settle = async (kind: 'load' | 'error') => {
  await vi.waitFor(() => {
    expect(scripts().at(-1)?.dataset['settled']).toBeUndefined()
  })
  const script = scripts().at(-1)
  if (script === undefined) throw new Error('No script was appended.')
  script.dataset['settled'] = kind
  script.dispatchEvent(new Event(kind))
}

beforeEach(() => {
  vi.resetModules()
  document.head.replaceChildren()
})

afterEach(() => {
  delete (window as { bryntum?: unknown }).bryntum
})

it('adds Bryntum’s styles, runs its scripts in order and resolves with its scheduler', async () => {
  const { loadBryntum } = await import('./bryntum-loader')
  const loaded = loadBryntum()
  expect([...document.head.querySelectorAll('link')].map((link) => link.getAttribute('href'))).toEqual([
    '/vendor/bryntum/scheduler.css',
    '/vendor/bryntum/stockholm-light.css',
    '/vendor/bryntum/fontawesome/css/fontawesome.css',
    '/vendor/bryntum/fontawesome/css/solid.css',
  ])
  const scheduler = { name: 'scheduler' }
  Object.assign(window, { bryntum: { scheduler } })
  for (let count = 0; count < 4; count += 1) await settle('load')
  await expect(loaded).resolves.toBe(scheduler)
  expect(scripts().map((script) => script.getAttribute('src'))).toEqual([
    '/vendor/bryntum/scheduler.umd.js',
    '/vendor/bryntum/locales/scheduler.locale.De.js',
    '/vendor/bryntum/locales/scheduler.locale.Es.js',
    '/vendor/bryntum/locales/scheduler.locale.FrFr.js',
  ])
  // A second calendar on the page loads nothing again.
  await expect(loadBryntum()).resolves.toBe(scheduler)
  expect(scripts()).toHaveLength(4)
})

it('fails when a script does not load, and tries again on the next call', async () => {
  const { loadBryntum } = await import('./bryntum-loader')
  const failed = loadBryntum()
  await settle('error')
  await expect(failed).rejects.toThrow('scheduler.umd.js')
  const again = loadBryntum()
  expect(scripts().at(-1)?.getAttribute('src')).toBe('/vendor/bryntum/scheduler.umd.js')
  Object.assign(window, { bryntum: { scheduler: { name: 'scheduler' } } })
  for (let count = 0; count < 4; count += 1) await settle('load')
  await expect(again).resolves.toBeDefined()
})
