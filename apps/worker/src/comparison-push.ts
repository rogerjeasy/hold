import type { StaffPush } from './push.ts'

// A comparison that finished, whatever it found or deferred, waits for a person's review: the counter's phones are told
// (architecture.md section 13.9). The push never fails the comparison; StaffPush logs its own failures.
export function withReviewPush<Message extends { readonly shopId: string; readonly comparisonId: string }>(run: (message: Message) => Promise<'completed' | 'nothing_to_do'>, push: StaffPush) {
  return async (message: Message) => {
    const outcome = await run(message)
    if (outcome === 'completed') await push(message.shopId, 'comparison_ready', { to: 'review', id: message.comparisonId })
    return outcome
  }
}
