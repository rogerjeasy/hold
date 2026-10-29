'use client'

import type { SavedInsightsDashboard } from '@hold/db'
import type { AgReportState, AgStudioApi } from 'ag-studio'
import { RotateCcw } from 'lucide-react'
import { useLocale, useMessages, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useShopFormat } from '@/hooks/use-shop-format'
import { askInsights, saveInsightsDashboard } from './actions'
import type { HoldRegistry } from './hold-registry'
import { holdLifeWidget, settlementWaterfallWidget } from './hold-widgets'
import type { HoldWidgetWords } from './hold-widgets'
import { INSIGHTS_REPORT_VERSION, insightsData, insightsState, withAgentPanel } from './insights-report'
import type { InsightsTables } from './insights-tables'
import { studioAdapter } from './studio-adapter'
import { loadStudio } from './studio-loader'
import type { AgStudioGlobal } from './studio-loader'

// AG Studio in Hold's own tokens, which follow the light and dark themes. Studio reads chart colours from the page
// once and keeps them, so a new theme object is handed over when the theme changes.
const holdTheme = (studio: AgStudioGlobal) =>
  studio.studioTheme.withParams({
    accentColor: 'var(--primary)',
    backgroundColor: 'var(--card)',
    foregroundColor: 'var(--card-foreground)',
    textColor: 'var(--card-foreground)',
    subtleTextColor: 'var(--muted-foreground)',
    borderColor: 'var(--border)',
    borderRadius: 0,
    fontFamily: 'var(--font-sans)',
    // The first series in Hold's accent and the second in its muted ink, as on the rest of Hold's pages.
    chartPaletteFills1Color: 'var(--primary)',
    chartPaletteFills2Color: 'var(--muted-foreground)',
    // Widget titles in Hold's type at the size of a section heading, so a title fits a widget a third of the canvas wide.
    studioWidgetTitleFontFamily: 'var(--font-sans)',
    studioWidgetTitleFontSize: 18,
    studioWidgetTitleFontWeight: 600,
    studioWidgetTitleTextColor: 'var(--card-foreground)',
    // Room for a finger, as on every page of Hold: the rail's tabs, the panels' headers, the pickers and lists.
    studioPanelItemCompactWidth: 44,
    studioPanelHeaderHeight: 44,
    pickerFieldHeight: 44,
    listItemHeight: 44,
  })

// A change is saved this long after the last one, so a burst of edits is one save.
const SAVE_AFTER = 1500
// From Tailwind's xl breakpoint the canvas has room beside the insights agent's panel.
const AGENT_PANEL_ROOM = '(min-width: 80rem)'

type Api = AgStudioApi<HoldRegistry>
type InsightsStudioProps = { tables: InsightsTables; saved: SavedInsightsDashboard | undefined; currency: string; licenceKey: string | undefined }

// The insights dashboard itself, in edit mode so the insights agent's panel is there. AG Studio's own browser build is
// loaded from Hold's origin; every model turn its agents take goes through Hold's server (studio-adapter.ts), and the
// dashboard as the person leaves it is kept for their next visit.
export function InsightsStudio({ tables, saved, currency, licenceKey }: InsightsStudioProps) {
  const t = useTranslations('insights')
  const messages = useMessages()
  const locale = useLocale()
  const format = useShopFormat({ timeZone: 'UTC', currency })
  const { resolvedTheme } = useTheme()
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ readonly studio: AgStudioGlobal; readonly api: Api } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const labels = messages.insights.report
  const words: HoldWidgetWords = {
    lifeLine: (line) => t('custom.lifeLine', line),
    stepLabel: (kind) => t(`custom.steps.${kind}`),
    withinHold: t('custom.withinHold'),
    beyondHold: t('custom.beyondHold'),
    money: format.money,
  }
  const starters = [
    { label: t('starterLabels.cost'), prompt: t('starters.cost') },
    { label: t('starterLabels.monthly'), prompt: t('starters.monthly') },
    { label: t('starterLabels.fastest'), prompt: t('starters.fastest') },
  ]
  // What the dashboard is built from, read once when it is created: Studio takes its data and starting state only then.
  // A dashboard saved on an earlier report opens as the first one, since it may name fields that are gone.
  const firstDashboard = insightsState(labels)
  const opening = saved?.reportVersion === INSIGHTS_REPORT_VERSION ? (saved.state as unknown as AgReportState<HoldRegistry>) : firstDashboard
  const build = useRef({ tables, currency, locale, labels, starters, words, opening, firstDashboard, licenceKey })

  const save = useRef<(report: AgReportState<HoldRegistry>) => void>(() => undefined)
  save.current = (report) => {
    setSaving('saving')
    const data = new FormData()
    data.set('state', JSON.stringify(report))
    data.set('reportVersion', String(INSIGHTS_REPORT_VERSION))
    void saveInsightsDashboard(null, data).then((result) => { setSaving(result.ok ? 'saved' : 'failed') }, () => { setSaving('failed') })
  }

  useEffect(() => {
    let cancelled = false
    let waiting: ReturnType<typeof setTimeout> | undefined
    void loadStudio()
      .then((studio) => {
        const element = host.current
        if (cancelled || element === null) return
        const from = build.current
        if (from.licenceKey !== undefined) studio.AgStudioLicenseManager.setLicenseKey(from.licenceKey)
        const created: Api = studio.createStudio<HoldRegistry>(
          element,
          {
            data: insightsData(from.tables, { currency: from.currency, locale: from.locale, label: from.labels, now: new Date() }),
            initialState: withAgentPanel(from.opening, { room: window.matchMedia(AGENT_PANEL_ROOM).matches }),
            mode: 'edit',
            theme: holdTheme(studio),
            panels: { edit: { left: ['filters'], right: ['ai', 'edit', 'data'] } },
            widgets: (defaults) =>
              studio.createWidgets<HoldRegistry>({
                additionalTypes: [
                  // Each reads its own rows, so its form has a title and no fields to map.
                  { id: 'holdLife', label: from.labels.widgets.life, comp: holdLifeWidget(from.words), form: (params) => params.createDefaults({ dataMappingItems: [] }), defaultSize: { width: 400, height: 360 }, minSize: { width: 280, height: 220 } },
                  { id: 'settlementWaterfall', label: from.labels.widgets.waterfall, comp: settlementWaterfallWidget(from.words), form: (params) => params.createDefaults({ dataMappingItems: [] }), defaultSize: { width: 400, height: 360 }, minSize: { width: 280, height: 220 } },
                ],
                menu: [...defaults.menu, { label: 'Hold', widgetIds: ['holdLife', 'settlementWaterfall'] }],
              }),
            ai: ({ api: studioApi }) => studio.createAiHarness(studioApi, { adapter: studioAdapter(askInsights), primary: 'lead', promptStarters: from.starters }),
            onStateUpdated: () => {
              clearTimeout(waiting)
              waiting = setTimeout(() => { save.current(created.getState()) }, SAVE_AFTER)
            },
          },
          { modules: [studio.AgStudioAiModule] },
        )
        api.current = { studio, api: created }
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
      clearTimeout(waiting)
      api.current?.api.destroy()
      api.current = null
    }
  }, [])

  useEffect(() => {
    const current = api.current
    if (current !== null && resolvedTheme !== undefined) current.api.updateProperties({ theme: holdTheme(current.studio) })
  }, [resolvedTheme])

  // Back to the dashboard a shop first sees, kept as its own from then on.
  const reset = () => {
    const current = api.current
    if (current === null) return
    current.api.setState(build.current.firstDashboard)
    save.current(build.current.firstDashboard)
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="min-h-6 text-sm text-muted-foreground">
          {state === 'loading' ? t('loading') : saving === 'saving' ? t('saving') : saving === 'saved' ? t('saved') : saving === 'failed' ? t('saveFailed') : ''}
        </p>
        <Button type="button" variant="outline" className="min-h-11" disabled={state !== 'ready'} onClick={reset}>
          <RotateCcw aria-hidden="true" />
          {t('reset')}
        </Button>
      </div>
      {state === 'failed' ? <p role="alert" className="font-semibold text-destructive">{t('loadFailed')}</p> : null}
      <div ref={host} role="region" aria-label={t('region')} className="hold-studio h-[calc(100dvh-12rem)] min-h-[44rem] min-w-0 border" />
    </div>
  )
}
