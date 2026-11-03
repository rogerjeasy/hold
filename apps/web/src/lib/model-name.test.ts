import { describe, expect, it } from 'vitest'
import { modelName } from './model-name'

describe('a model\'s name as a person reads it', () => {
  it('names a Claude model by its family and version, whatever inference profile it ran through', () => {
    expect(modelName('us.anthropic.claude-opus-4-6-v1')).toBe('Claude Opus 4.6')
    expect(modelName('anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Claude Sonnet 4.5')
  })

  it('shows any other model as it was stored', () => {
    expect(modelName('simulated')).toBe('simulated')
  })
})
