import '@testing-library/jest-dom/vitest'
import './src/test/navigation'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { navigation } from './src/test/navigation'

// jsdom has no layout engine, so it lacks the browser APIs that Radix and next-themes call.
// Server tests run in Node, with no window at all.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
}

afterEach(() => {
  cleanup()
  navigation.pathname = '/'
  if (typeof window === 'undefined') return
  document.documentElement.className = ''
  localStorage.clear()
})
