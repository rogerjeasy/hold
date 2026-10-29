import { themeQuartz } from 'ag-grid-community'

// AG Grid in Hold's own design tokens, for every grid in the app, so each reads as part of the ledger, in the light
// theme and the dark one alike: the tokens change with the theme and the grid follows them. Square corners, Hold's
// type, one orange accent for focus and choice, and headers set like Hold's labels.
export const holdGridTheme = themeQuartz.withParams({
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--card-foreground)',
  textColor: 'var(--card-foreground)',
  subtleTextColor: 'var(--muted-foreground)',
  accentColor: 'var(--primary)',
  borderColor: 'var(--border)',
  chromeBackgroundColor: 'var(--card)',
  headerBackgroundColor: 'var(--card)',
  headerTextColor: 'var(--muted-foreground)',
  headerFontFamily: 'var(--font-mono)',
  headerFontSize: 12,
  headerFontWeight: 500,
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  rowHoverColor: 'color-mix(in oklab, var(--muted) 60%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
  // Cells chosen in the price list editor: a tint with the accent's edge, so their text stays readable.
  rangeSelectionBackgroundColor: 'color-mix(in oklab, var(--primary) 14%, transparent)',
  rangeSelectionBorderColor: 'var(--primary)',
  borderRadius: 0,
  wrapperBorderRadius: 0,
  rowHeight: 76,
  headerHeight: 48,
  cellHorizontalPaddingScale: 1.1,
  focusShadow: { spread: 2, color: 'var(--ring)' },
  rowBorder: { color: 'var(--border)' },
})
