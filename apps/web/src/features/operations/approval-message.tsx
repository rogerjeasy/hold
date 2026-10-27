'use client'

import { ActionMessage } from '@/features/shop/action-message'
import type { ShopActionResult } from '@/server/shop-access'

type Outcome = { readonly proposalId: string; readonly ok: true; readonly state: string } | { readonly proposalId: string; readonly ok: false; readonly reason: string }

// What an approval answered. A refusal is worded as any other; an approval that went through for some entries and not
// others, such as one superseded because its records changed, says so for each one that did not.
export function ApprovalMessage({ result, success }: { result: ShopActionResult<{ readonly outcomes: readonly Outcome[] }> | null; success: string }) {
  if (result === null || !result.ok) return <ActionMessage result={result} success={success} results="operations.results" />
  const refused = result.value.outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome]))
  return (
    <div className="grid gap-1">
      {refused.length < result.value.outcomes.length ? <ActionMessage result={{ ok: true, value: null }} success={success} /> : null}
      {refused.map((outcome) => (
        <ActionMessage key={outcome.proposalId} result={{ ok: false, failure: 'refused', reason: outcome.reason }} success={success} results="operations.results" />
      ))}
    </div>
  )
}
