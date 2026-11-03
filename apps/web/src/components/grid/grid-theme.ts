import { themeQuartz } from 'ag-grid-community'

// AG Grid in Hold's own design tokens, for every grid in the app, so each reads as one of Hold's cards, in the light
// theme and the dark one alike: the tokens change with the theme and the grid follows them. A rounded card with a
// hairline, a soft header band whose names read at a comfortable size, rows that warm a little under the pointer, and
// one orange accent for focus and choice.
export const holdGridTheme = themeQuartz.withParams({
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--card-foreground)',
  textColor: 'var(--card-foreground)',
  subtleTextColor: 'var(--muted-foreground)',
  accentColor: 'var(--primary)',
  borderColor: 'color-mix(in oklab, var(--border) 85%, transparent)',
  chromeBackgroundColor: 'var(--card)',
  // The header sits on a faint band of the paper, so it reads as a header without a heavy rule.
  headerBackgroundColor: 'color-mix(in oklab, var(--muted) 65%, var(--card))',
  // The muted ink keeps more than 4.5:1 on that band in both themes; the names are Hold's sans at 13 pixels, not tiny
  // capitals.
  headerTextColor: 'var(--muted-foreground)',
  headerFontFamily: 'var(--font-sans)',
  headerFontSize: 13,
  headerFontWeight: 600,
  headerHeight: 46,
  headerRowBorder: { color: 'var(--border)' },
  headerColumnBorder: false,
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  rowHoverColor: 'color-mix(in oklab, var(--muted) 55%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in oklab, var(--primary) 8%, transparent)',
  // Cells chosen in the price list editor: a tint with the accent's edge, so their text stays readable.
  rangeSelectionBackgroundColor: 'color-mix(in oklab, var(--primary) 14%, transparent)',
  rangeSelectionBorderColor: 'var(--primary)',
  // The card's corners are the app's own (rounded-2xl); menus, inputs and pickers inside take the smaller radius.
  borderRadius: 8,
  wrapperBorderRadius: 18,
  wrapperBorder: { color: 'var(--border)' },
  rowHeight: 76,
  cellHorizontalPaddingScale: 1.15,
  focusShadow: { spread: 2, color: 'var(--ring)' },
  rowBorder: { color: 'color-mix(in oklab, var(--border) 75%, transparent)' },
  columnBorder: false,
  menuShadow: 'var(--shadow-overlay)',
  popupShadow: 'var(--shadow-overlay)',
  cardShadow: 'var(--shadow-card)',
})
