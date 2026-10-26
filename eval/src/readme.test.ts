import { expect, it } from 'vitest'
import { withScorecard } from './readme.ts'

it('replaces only what lies between the scorecard markers', () => {
  const readme = 'intro\n<!-- scorecard:start -->\nold table\n<!-- scorecard:end -->\noutro\n'
  expect(withScorecard(readme, '| new |')).toBe('intro\n<!-- scorecard:start -->\n| new |\n<!-- scorecard:end -->\noutro\n')
})

it('refuses a README without its markers rather than guessing where the table goes', () => {
  expect(() => withScorecard('no markers', '| new |')).toThrow('scorecard markers')
})
