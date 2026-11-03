import type { ColDef } from 'ag-grid-community'

// A narrow column that holds one control per row, such as the button that opens a row or the box that chooses it: wide
// enough for a 44-pixel target and its header's short name, with less padding than a column of words.
export const CONTROL_COLUMN = {
  width: 72,
  maxWidth: 72,
  sortable: false,
  suppressHeaderMenuButton: true,
  headerClass: '[--ag-cell-horizontal-padding:0.625rem]',
  cellClass: '[--ag-cell-horizontal-padding:0.625rem]',
} as const satisfies ColDef
