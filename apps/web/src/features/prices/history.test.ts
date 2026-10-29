import { describe, expect, it } from 'vitest'
import { historyReducer, startHistory } from './history'

// Every change to the draft can be taken back, and taken back again, a paste of forty rows as much as one cell.
describe('the undo history', () => {
  it('undoes and redoes changes in order, and a new change after an undo drops what could have been redone', () => {
    let state = startHistory('a')
    state = historyReducer(state, { kind: 'set', next: 'b' })
    state = historyReducer(state, { kind: 'set', next: 'c' })
    state = historyReducer(state, { kind: 'undo' })
    expect(state.present).toBe('b')
    state = historyReducer(state, { kind: 'redo' })
    expect(state.present).toBe('c')
    state = historyReducer(state, { kind: 'undo' })
    state = historyReducer(state, { kind: 'set', next: 'd' })
    expect(state).toMatchObject({ present: 'd', future: [] })
    expect(historyReducer(startHistory('a'), { kind: 'undo' }).present).toBe('a')
  })

  it('keeps no more than its limit of steps, and starts again from a published version', () => {
    let state = startHistory(0)
    for (let step = 1; step <= 150; step += 1) state = historyReducer(state, { kind: 'set', next: step })
    expect(state.past).toHaveLength(100)
    expect(historyReducer(state, { kind: 'reset', present: 7 })).toEqual({ past: [], present: 7, future: [] })
  })
})
