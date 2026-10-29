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
  delete (window as { agStudio?: unknown }).agStudio
})

it('runs AG Studio’s browser build once from Hold’s origin and resolves with what it puts on the window', async () => {
  const { loadStudio } = await import('./studio-loader')
  const loaded = loadStudio()
  const studio = { createStudio: () => undefined }
  Object.assign(window, { agStudio: studio })
  await settle('load')
  await expect(loaded).resolves.toBe(studio)
  expect(scripts().map((script) => script.getAttribute('src'))).toEqual(['/vendor/ag-studio/ag-studio.min.js'])
  await expect(loadStudio()).resolves.toBe(studio)
  expect(scripts()).toHaveLength(1)
})

it('fails when the build does not load or leaves nothing on the window, and tries again on the next call', async () => {
  const { loadStudio } = await import('./studio-loader')
  const failed = loadStudio()
  await settle('error')
  await expect(failed).rejects.toThrow('did not load')
  const empty = loadStudio()
  await settle('load')
  await expect(empty).rejects.toThrow('without')
  const again = loadStudio()
  Object.assign(window, { agStudio: { createStudio: () => undefined } })
  await settle('load')
  await expect(again).resolves.toBeDefined()
})
