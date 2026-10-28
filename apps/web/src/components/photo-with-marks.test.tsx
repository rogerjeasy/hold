import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PhotoWithMarks } from './photo-with-marks'

describe('a photograph with its marks', () => {
  it('shows the whole photograph at its own shape once loaded, so each box sits where it was drawn', () => {
    render(<PhotoWithMarks src="/photo.jpg" alt="Left side" marks={[{ id: 'm', region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }]} />)
    const image = screen.getByRole('img', { name: 'Left side' })
    const frame = image.parentElement
    // A 4:3 space is kept while it loads, so nothing jumps more than once.
    expect(frame?.style.aspectRatio).toBe('4 / 3')
    Object.defineProperty(image, 'naturalWidth', { value: 2100 })
    Object.defineProperty(image, 'naturalHeight', { value: 900 })
    fireEvent.load(image)
    expect(frame?.style.aspectRatio).toBe('2100 / 900')
    expect(image.className).not.toContain('object-cover')
    const box = frame?.querySelector('[data-mark="m"]') as HTMLElement | null
    expect([box?.style.left, box?.style.top, box?.style.width, box?.style.height]).toEqual(['10%', '20%', '30%', '40%'])
  })

  it('takes the shape of a photograph already loaded before the page came alive, as on a page drawn on the server', () => {
    const prototype = HTMLImageElement.prototype
    const saved = ['complete', 'naturalWidth', 'naturalHeight'].map((key) => [key, Object.getOwnPropertyDescriptor(prototype, key)] as const)
    Object.defineProperty(prototype, 'complete', { configurable: true, get: () => true })
    Object.defineProperty(prototype, 'naturalWidth', { configurable: true, get: () => 1600 })
    Object.defineProperty(prototype, 'naturalHeight', { configurable: true, get: () => 685 })
    try {
      render(<PhotoWithMarks src="/photo.jpg" alt="Right side" marks={[]} />)
      expect(screen.getByRole('img', { name: 'Right side' }).parentElement?.style.aspectRatio).toBe('1600 / 685')
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor === undefined) Reflect.deleteProperty(prototype, key)
        else Object.defineProperty(prototype, key, descriptor)
      }
    }
  })

  it('draws where the damage truly is apart from what the comparison found, so the two can be told apart', () => {
    render(<PhotoWithMarks src="/photo.jpg" alt="Return" marks={[{ id: 'truth', region: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, tone: 'truth' }, { id: 'found', region: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }]} />)
    const frame = screen.getByRole('img', { name: 'Return' }).parentElement
    const truth = frame?.querySelector('[data-mark="truth"]')
    const found = frame?.querySelector('[data-mark="found"]')
    expect(truth?.getAttribute('data-tone')).toBe('truth')
    expect(found?.getAttribute('data-tone')).toBe('finding')
    expect(truth?.className).not.toBe(found?.className)
  })
})
