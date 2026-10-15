import type { Page } from '@playwright/test'
import { expect } from './test'

// The widths AGENTS.md section 9 names. Tablets are also checked on their side.
export const viewports = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '820', width: 820, height: 1180 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1180 (tablet on its side)', width: 1180, height: 820 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
] as const

const MIN_TOUCH_TARGET = 44

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

// Lists elements that stick out of the viewport and are not cut off by a clipping ancestor.
export async function expectNothingOutsideViewport(page: Page): Promise<void> {
  const outside = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const clips = (element: Element): boolean => {
      for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (style.overflowX !== 'visible' || style.clipPath !== 'none') return true
      }
      return false
    }
    return [...document.body.querySelectorAll('*')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        if (box.width <= 1 || box.height <= 1) return false
        if (box.right <= viewportWidth + 1 && box.left >= -1) return false
        return !clips(element)
      })
      .map((element) => `${element.tagName.toLowerCase()}.${(element.getAttribute('class') ?? '').slice(0, 60)}`)
  })
  expect(outside, 'elements reach outside the viewport').toEqual([])
}

// Text that is wider than its own box has been clipped or is overflowing its container.
export async function expectNoClippedText(page: Page): Promise<void> {
  const clipped = await page.evaluate(() =>
    [...document.body.querySelectorAll('h1, h2, h3, p, li, a, button, th, td, dt, dd, span')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        // Text kept for screen readers only is squeezed into one pixel on purpose.
        if (style.display === 'inline' || box.width <= 1 || box.height <= 1) return false
        // Text cut short with an ellipsis is truncated on purpose (AGENTS.md section 9), such as a long shop name in
        // the shop's menu, whose whole name the menu's label and list give.
        if (style.textOverflow === 'ellipsis' && style.overflowX === 'hidden') return false
        return element.scrollWidth > element.clientWidth + 1
      })
      .map((element) => `${element.tagName.toLowerCase()}: ${element.textContent.trim().slice(0, 50)}`),
  )
  expect(clipped, 'text is wider than its container').toEqual([])
}

export async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.evaluate((minimum) => {
    return [...document.body.querySelectorAll('a[href], button, input')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const hidden = box.width <= 1 || box.height <= 1 || style.visibility === 'hidden'
        return !hidden && (box.height < minimum - 0.5 || box.width < minimum - 0.5)
      })
      .map((element) => {
        const box = element.getBoundingClientRect()
        return `${element.textContent.trim().slice(0, 40)} (${String(Math.round(box.width))}x${String(Math.round(box.height))})`
      })
  }, MIN_TOUCH_TARGET)
  expect(small, 'controls smaller than 44 by 44 pixels').toEqual([])
}
