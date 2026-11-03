import { describe, expect, it } from 'vitest'
import { keepCalendarAria } from './calendar-aria'

// Bryntum's own structure, as it draws it: rows in a rowgroup, and beside them a canvas of bars marked presentation.
function drawn(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <div role="grid" aria-label="Item">
      <div role="rowgroup" class="b-grid-sub-grid">
        <div role="row" class="b-grid-row"><div role="gridcell">City bike 1</div></div>
        <div role="presentation" class="b-sch-canvas b-sch-foreground-canvas">
          <div role="button" tabindex="0" class="b-sch-event-wrap" aria-label="Ahmed Khan, starts at Nov 2">Ahmed Khan</div>
        </div>
      </div>
    </div>`
  document.body.append(root)
  return root
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the calendar’s bars, as a screen reader meets them', () => {
  it('stand as cells of a row named for the rentals, as a grid allows, each keeping its name and its place in the tab order', () => {
    const root = drawn()
    const stop = keepCalendarAria(root, 'Rentals')
    const canvas = root.querySelector('.b-sch-foreground-canvas')
    const bar = root.querySelector('.b-sch-event-wrap')
    expect(canvas?.getAttribute('role')).toBe('row')
    expect(canvas?.getAttribute('aria-label')).toBe('Rentals')
    expect(bar?.getAttribute('role')).toBe('gridcell')
    expect(bar?.getAttribute('aria-label')).toBe('Ahmed Khan, starts at Nov 2')
    expect(bar?.getAttribute('tabindex')).toBe('0')
    stop()
  })

  it('stay so when Bryntum draws a bar again or adds one while scrolling', async () => {
    const root = drawn()
    const stop = keepCalendarAria(root, 'Rentals')
    const canvas = root.querySelector('.b-sch-foreground-canvas')
    const first = root.querySelector('.b-sch-event-wrap')
    first?.setAttribute('role', 'button')
    const added = document.createElement('div')
    added.className = 'b-sch-event-wrap'
    added.setAttribute('role', 'button')
    canvas?.append(added)
    await settle()
    expect(first?.getAttribute('role')).toBe('gridcell')
    expect(added.getAttribute('role')).toBe('gridcell')
    stop()
  })

  it('say who rents, where the hold stands and the dates, in the shop’s own words, in place of Bryntum’s', () => {
    const root = drawn()
    const stop = keepCalendarAria(root, 'Rentals', (bar) => (bar.textContent === 'Ahmed Khan' ? 'Ahmed Khan, Held on PayPal, Nov 2 – Nov 3' : null))
    expect(root.querySelector('.b-sch-event-wrap')?.getAttribute('aria-label')).toBe('Ahmed Khan, Held on PayPal, Nov 2 – Nov 3')
    stop()
  })
})
