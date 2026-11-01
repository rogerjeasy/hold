import { describe, expect, it, vi } from 'vitest'
import { withReviewPush } from './comparison-push.ts'

const MESSAGE = { shopId: '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b', comparisonId: '0b6f1f6e-1d7a-4a39-9d3e-2f8c4a1b5c6d' }

describe('a finished comparison', () => {
  it('tells the counter’s phones it is ready to review, opening that review', async () => {
    const push = vi.fn(() => Promise.resolve())
    expect(await withReviewPush(() => Promise.resolve('completed' as const), push)(MESSAGE)).toBe('completed')
    expect(push).toHaveBeenCalledWith(MESSAGE.shopId, 'comparison_ready', { to: 'review', id: MESSAGE.comparisonId })
  })

  it('tells nobody when there was nothing to compare', async () => {
    const push = vi.fn(() => Promise.resolve())
    await withReviewPush(() => Promise.resolve('nothing_to_do' as const), push)(MESSAGE)
    expect(push).not.toHaveBeenCalled()
  })
})
