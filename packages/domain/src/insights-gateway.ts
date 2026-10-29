import type { ToolTier } from './agent-gateway.ts'

// The insights agent's gate (extensions.md section 12.5). The agent runs inside AG Studio in the browser, and Studio
// carries out its tool calls there; but every turn's model call goes through Hold's server, which passes on only the
// calls this gate keeps. Every tool here reads Hold's rows already in the page or arranges the dashboard. None reaches
// a Hold record, and none is above the draft tier.

export const INSIGHTS_TOOLS = {
  view_schema: 'read',
  view_report: 'read',
  view_page: 'read',
  view_widget: 'read',
  view_plan: 'read',
  execute_query: 'read',
  create_plan: 'draft',
  update_plan: 'draft',
  clear_plan: 'draft',
  rename_thread: 'draft',
  delegate_to: 'draft',
  complete_task: 'draft',
  add_widget: 'draft',
  position_widget: 'draft',
  remove_widget: 'draft',
  configure_widget: 'draft',
  add_page_filter: 'draft',
  remove_page_filter: 'draft',
  add_widget_filter: 'draft',
  remove_widget_filter: 'draft',
  create_expression: 'draft',
  update_expression: 'draft',
  delete_expression: 'draft',
} as const satisfies Readonly<Record<string, Extract<ToolTier, 'read' | 'draft'>>>

export type InsightsCall = { readonly callId: string; readonly name: string }
export type DroppedCall = InsightsCall & { readonly reason: 'not_offered' | 'not_a_dashboard_tool' }

const isDashboardTool = (name: string): name is keyof typeof INSIGHTS_TOOLS => Object.hasOwn(INSIGHTS_TOOLS, name)

// Keeps a call only to a dashboard tool the turn offered the model; says why any other was dropped.
export function gateInsightsCalls<Call extends InsightsCall>(calls: readonly Call[], offered: readonly string[]): { readonly kept: Call[]; readonly dropped: DroppedCall[] } {
  const kept: Call[] = []
  const dropped: DroppedCall[] = []
  for (const call of calls) {
    if (!isDashboardTool(call.name)) dropped.push({ callId: call.callId, name: call.name, reason: 'not_a_dashboard_tool' })
    else if (!offered.includes(call.name)) dropped.push({ callId: call.callId, name: call.name, reason: 'not_offered' })
    else kept.push(call)
  }
  return { kept, dropped }
}
