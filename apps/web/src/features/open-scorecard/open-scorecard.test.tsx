import type { EvaluatedCase, TrendRun } from '@hold/domain'
import { measureEvaluation } from '@hold/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import type { CaseGridProps } from './case-grid'
import { OpenScorecard } from './open-scorecard'

// The open scorecard as a renter or a judge reads it. The grid needs a browser's layout and is checked end to end;
// here it is a stand-in that lists the pairs it was given and lets a test choose one.
vi.mock('./case-grid', () => ({
  CaseGrid: ({ rows, onChoose }: CaseGridProps) => (
    <ul aria-label="Grid stand-in">
      {rows.map((row) => <li key={row.id}><button type="button" onClick={() => { onChoose(row.id) }}>{`Choose ${row.id}`}</button></li>)}
    </ul>
  ),
}))

const box = (x: number) => ({ x, y: 0.4, width: 0.1, height: 0.1 })
const pair = (overrides: Partial<EvaluatedCase>): EvaluatedCase => ({
  id: 'case', group: 'clean_easy', origin: 'real', view: 'frame-left', before: 'gate/b.jpg', after: 'gate/a.jpg', alignment: 0.93,
  labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 4200, inputTokens: 3000, outputTokens: 400, ...overrides,
})
const found = { region: box(0.41), class: 'new_damage' as const, confidence: 0.95, secondLookConfirmed: true }
const cases: EvaluatedCase[] = [
  pair({ id: 'clean-1' }),
  pair({ id: 'clean-2', group: 'clean_hard', state: 'findings', findings: [{ ...found, region: box(0.7), confidence: 0.93 }] }),
  pair({ id: 'damage-1', group: 'damage', origin: 'synthetic', state: 'findings', labels: [{ kind: 'damage', region: box(0.4) }], findings: [found] }),
  pair({ id: 'damage-2', group: 'damage', state: 'deferred', labels: [{ kind: 'damage', region: box(0.4) }], findings: [{ ...found, region: box(0.8), confidence: 0.75, secondLookConfirmed: false }] }),
  pair({ id: 'reused-1', group: 'identity', state: 'deferred', alignment: null }),
]
const measures = measureEvaluation(cases)
const history: TrendRun[] = [
  { id: 'r1', completedAt: new Date('2026-11-02T10:00:00Z'), accepted: true, gatePassed: true, pipelineVersion: 'inspection-2+a1', measures, gateLimits: null },
  { id: 'r2', completedAt: new Date('2026-11-04T10:00:00Z'), accepted: false, gatePassed: false, pipelineVersion: 'inspection-3+b2', measures: { ...measures, cleanWronglyFlagged: { count: 2, total: 2 } }, gateLimits: { maxCleanWronglyFlagged: 0.1, maxDamageFoundDrop: 0.1 } },
]

const show = () => renderWithIntl(<OpenScorecard cases={cases} history={history} />)
const panel = () => screen.getByRole('region', { name: 'Chosen pair' })

describe('the open scorecard', () => {
  it('shows each group with how many of its pairs the comparison got right, and filters the pairs by group', async () => {
    const user = userEvent.setup()
    show()
    expect(screen.getByRole('button', { name: /^Damage 1 of 2 right$/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Damage/ }))
    expect(within(screen.getByRole('list', { name: 'Grid stand-in' })).getAllByRole('button').map((each) => each.textContent)).toEqual(['Choose damage-1', 'Choose damage-2'])
  })

  it('opens a chosen pair with both photographs, what it should have ended in, what the comparison found, and the legend', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Choose damage-1' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Pair damage-1' })).toBeInTheDocument()
    expect(within(chosen).getByText('Synthetic')).toBeInTheDocument()
    expect(within(chosen).getByRole('img', { name: 'Handover photograph of pair damage-1' })).toHaveAttribute('src', '/eval/gate/b.jpg')
    expect(within(chosen).getByRole('img', { name: 'Return photograph of pair damage-1' })).toHaveAttribute('src', '/eval/gate/a.jpg')
    expect(within(chosen).getByText('Should have ended: Findings. Ended: Findings.')).toBeInTheDocument()
    expect(within(chosen).getByText('New damage at 95% confidence')).toBeInTheDocument()
    expect(within(chosen).getByText('Right')).toBeInTheDocument()
    expect(within(chosen).getByText(/^Green: where the damage truly is/)).toBeInTheDocument()
  })

  it('says when a pair never lined up because the reuse check stopped it first', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Choose reused-1' }))
    expect(within(panel()).getByText('Never lined up: the check for a reused photograph stopped it first.')).toBeInTheDocument()
  })

  it('counts, level by level, how often a claimed change was right, the same counts a finding in a shop shows', () => {
    show()
    const table = screen.getByRole('table', { name: 'Does confidence hold up?' })
    const high = within(table).getByRole('row', { name: /^high/ })
    expect(high).toHaveTextContent(`${String(measures.confidence.high.count)} of ${String(measures.confidence.high.total)}`)
    expect(within(table).getByRole('row', { name: /^medium/ })).toHaveTextContent('0 of 1')
  })

  it('sets what each pair should have ended in against what it did, a count in every cell', () => {
    show()
    const matrix = screen.getByRole('table', { name: 'Should have ended, against ended' })
    const cleanRow = within(matrix).getByRole('row', { name: /^Clean/ })
    expect(within(cleanRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['1 pair, right', '1 pair', '0 pairs'])
  })

  it('shows every run against the lines its gate drew, and says which crossed', () => {
    show()
    const trend = screen.getByRole('region', { name: 'Run against run' })
    const runs = within(trend).getAllByRole('listitem')
    expect(runs).toHaveLength(2)
    expect(runs[0]).toHaveTextContent('No line: the limits are set after the first run.')
    expect(runs[1]).toHaveTextContent('Limit 10%')
    expect(runs[1]).toHaveTextContent('Crossed the line')
    expect(runs[1]).toHaveTextContent('Stopped by the gate')
  })
})
