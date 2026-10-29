import type { AgTypeScriptComponent, AgWidgetField, AgWidgetParams } from 'ag-studio'
import { lifeSegments, waterfallSteps } from './widget-shapes'
import type { LifeSegment, WaterfallStep } from './widget-shapes'

// The insights dashboard's own widgets (extensions.md section 12.5), as AG Studio's browser build takes them: classes
// that draw into an element, outside React. They read their rows through the widget API, so the page's filters apply,
// and every value they show is written as text, never as markup.

export type HoldWidgetWords = {
  readonly lifeLine: (line: { day: number; days: number; standing: string; amount: string }) => string
  readonly stepLabel: (kind: WaterfallStep['kind']) => string
  readonly withinHold: string
  readonly beyondHold: string
  readonly money: (cents: number) => string
}

// Hold's tokens for each part of a bar; the words beside each bar say the same, so no meaning rests on colour.
const SEGMENT_COLOURS: Readonly<Record<LifeSegment['kind'], string>> = { assured: 'var(--success)', valid: 'var(--muted-foreground)', ending: 'var(--primary)' }
const STEP_COLOURS: Readonly<Record<WaterfallStep['kind'], string>> = { reserved: 'var(--foreground)', captured: 'var(--primary)', released: 'var(--success)', held: 'var(--muted-foreground)' }
// The holds a line is drawn for, the nearest their end first.
const MOST_LINES = 12

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text?: string): HTMLElementTagNameMap[Tag] {
  const made = document.createElement(tag)
  made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

function bar(parts: readonly { readonly from: number; readonly to: number; readonly colour: string }[], marker?: number): HTMLElement {
  const track = element('div', 'relative h-2.5 w-full bg-muted')
  track.setAttribute('aria-hidden', 'true')
  for (const part of parts) {
    const fill = element('span', 'absolute inset-y-0')
    fill.style.left = `${String(part.from * 100)}%`
    fill.style.width = `${String((part.to - part.from) * 100)}%`
    fill.style.backgroundColor = part.colour
    track.append(fill)
  }
  if (marker !== undefined) {
    const today = element('span', 'absolute -inset-y-1 w-0.5 bg-foreground')
    today.style.left = `${String(marker * 100)}%`
    track.append(today)
  }
  return track
}

// The fields of one of Hold's tables, as the report's schema has them.
function fieldsOf(params: AgWidgetParams, table: string, ids: readonly string[]): AgWidgetField[] | undefined {
  const fields = params.widgetApi.getSchema().find((each) => each.id === table)?.fields ?? []
  const found = ids.map((id) => fields.find((field) => field.fieldId === `${table}.${id}`))
  return found.every((field): field is AgWidgetField => field !== undefined) ? found : undefined
}

const number = (value: unknown) => (typeof value === 'number' ? value : 0)

abstract class HoldWidget implements AgTypeScriptComponent<AgWidgetParams> {
  protected readonly root = element('div', 'grid h-full min-w-0 content-start gap-3 overflow-auto p-4 text-card-foreground')
  protected readonly words: HoldWidgetWords
  constructor(words: HoldWidgetWords) {
    this.words = words
  }
  getGui(): HTMLElement {
    return this.root
  }
  init(params: AgWidgetParams): Promise<void> {
    // Its lines can outrun the widget's height, so the keyboard can reach and scroll it, by the widget's own title.
    this.root.tabIndex = 0
    this.root.setAttribute('role', 'group')
    const title: unknown = params.format?.title?.text
    if (typeof title === 'string') this.root.setAttribute('aria-label', title)
    return this.draw(params)
  }
  refresh(params: AgWidgetParams): Promise<void> {
    return this.draw(params)
  }
  protected abstract draw(params: AgWidgetParams): Promise<void>
}

// Every hold PayPal holds now on its 29-day line: assured, valid and ending, with today marked.
export function holdLifeWidget(words: HoldWidgetWords) {
  return class HoldLife extends HoldWidget {
    constructor() {
      super(words)
    }
    protected async draw(params: AgWidgetParams): Promise<void> {
      const fields = fieldsOf(params, 'lives', ['rental_id', 'day', 'days', 'assured_days', 'standing', 'reserved'])
      if (fields === undefined) {
        params.widgetApi.setDisplayState('noData')
        return
      }
      params.widgetApi.setDisplayState('loading')
      const { results } = await params.widgetApi.getData({ fields })
      const [, day, days, assured, standing, reserved] = fields.map((field) => field.key)
      const rows = results.rows
        .map((row) => ({ day: number(row[day ?? '']), days: number(row[days ?? '']), assuredDays: number(row[assured ?? '']), standing: String(row[standing ?? ''] ?? ''), reserved: number(row[reserved ?? '']) }))
        .sort((first, second) => second.day - first.day)
        .slice(0, MOST_LINES)
      this.root.replaceChildren(...rows.map((row) => {
        const shape = lifeSegments(row)
        const line = element('div', 'grid gap-1.5')
        line.append(element('p', 'text-sm tabular-nums', this.words.lifeLine({ day: Math.min(row.day, row.days), days: row.days, standing: row.standing, amount: this.words.money(Math.round(row.reserved * 100)) })), bar(shape.segments.map((segment) => ({ ...segment, colour: SEGMENT_COLOURS[segment.kind] })), shape.today))
        return line
      }))
      params.widgetApi.setDisplayState(rows.length === 0 ? 'noData' : 'displayed')
    }
  }
}

// What was reserved, stepping down by what was captured and what was released to what is still held, and whether
// captured plus released stayed within what was reserved.
export function settlementWaterfallWidget(words: HoldWidgetWords) {
  return class SettlementWaterfall extends HoldWidget {
    constructor() {
      super(words)
    }
    protected async draw(params: AgWidgetParams): Promise<void> {
      const fields = fieldsOf(params, 'rentals', ['rental_id', 'reserved', 'captured', 'released'])
      if (fields === undefined) {
        params.widgetApi.setDisplayState('noData')
        return
      }
      params.widgetApi.setDisplayState('loading')
      // A row for each rental, added up here: the totals across the rentals the page's filters leave.
      const { results } = await params.widgetApi.getData({ fields })
      const [, reserved, captured, released] = fields.map((field) => field.key)
      const cents = (key: string | undefined) => Math.round(results.rows.reduce((sum, row) => sum + number(row[key ?? '']), 0) * 100)
      const shape = waterfallSteps({ reservedCents: cents(reserved), capturedCents: cents(captured), releasedCents: cents(released) })
      this.root.replaceChildren(
        ...shape.steps.map((step) => {
          const line = element('div', 'grid gap-1.5')
          const label = element('p', 'flex flex-wrap justify-between gap-x-3 text-sm')
          label.append(element('span', '', this.words.stepLabel(step.kind)), element('span', 'figures', this.words.money(step.cents)))
          line.append(label, bar([{ from: step.from, to: step.to, colour: STEP_COLOURS[step.kind] }]))
          return line
        }),
        element('p', shape.withinHold ? 'text-sm font-semibold' : 'text-sm font-semibold text-destructive', shape.withinHold ? this.words.withinHold : this.words.beyondHold),
      )
      params.widgetApi.setDisplayState(shape.steps[0]?.cents === 0 ? 'noData' : 'displayed')
    }
  }
}
