import type { AgDefaultRegistry, AgTypeScriptWidgetDefinition, AgWidgetData, AgWidgetDataFormat } from 'ag-studio'

// The widgets the insights dashboard knows: AG Studio's own, and Hold's two (hold-widgets.ts), which read their rows
// from the report's schema and so take no data mapping.
export type HoldWidgetType = 'holdLife' | 'settlementWaterfall'
export type HoldWidgetState<Type extends HoldWidgetType> = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: Type }
export type HoldWidgetDefinition = AgTypeScriptWidgetDefinition<'holdLife', HoldWidgetState<'holdLife'>> | AgTypeScriptWidgetDefinition<'settlementWaterfall', HoldWidgetState<'settlementWaterfall'>>

export interface HoldRegistry extends Omit<AgDefaultRegistry, 'widgets'> {
  widgets: readonly (AgDefaultRegistry['widgets'][number] | HoldWidgetDefinition)[]
}
