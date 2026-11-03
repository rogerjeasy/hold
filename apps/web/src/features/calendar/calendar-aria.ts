// Bryntum Scheduler draws each rental's bar as role="button" in a canvas marked presentation, inside the grid's
// rowgroup, which a grid does not allow (axe: aria-required-children), and no setting changes it. Here the canvas
// stands as one row named for the rentals and each bar as a cell in it: each keeps its name, its tab stop and its Enter.
// Bryntum draws bars again as the calendar scrolls, so the roles are kept as it does. Its own label for a bar ends in a
// raw fraction of days ("for 1.3118055556 days"), so the shop's words, when given, replace it.
type LabelFor = (bar: Element) => string | null

function fix(root: ParentNode, rowLabel: string, labelFor: LabelFor | undefined): void {
  for (const canvas of root.querySelectorAll('.b-sch-foreground-canvas')) {
    if (canvas.getAttribute('role') !== 'row') canvas.setAttribute('role', 'row')
    if (canvas.getAttribute('aria-label') !== rowLabel) canvas.setAttribute('aria-label', rowLabel)
  }
  for (const bar of root.querySelectorAll('.b-sch-event-wrap')) {
    if (bar.getAttribute('role') !== 'gridcell') bar.setAttribute('role', 'gridcell')
    const label = labelFor?.(bar) ?? null
    if (label !== null && bar.getAttribute('aria-label') !== label) bar.setAttribute('aria-label', label)
  }
}

// Returns the function that stops keeping them.
export function keepCalendarAria(root: HTMLElement, rowLabel: string, labelFor?: LabelFor): () => void {
  fix(root, rowLabel, labelFor)
  // Each change made here is a change the observer hears too; fix only writes what differs, so it settles at once.
  const observer = new MutationObserver(() => {
    fix(root, rowLabel, labelFor)
  })
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['role', 'aria-label'] })
  return () => {
    observer.disconnect()
  }
}
