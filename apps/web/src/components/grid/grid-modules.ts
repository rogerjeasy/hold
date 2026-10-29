import { CellStyleModule, ClientSideRowModelModule, ModuleRegistry, RowApiModule, RowDragModule, RowSelectionModule, SelectEditorModule, TextEditorModule, ValidationModule } from 'ag-grid-community'

// The AG Grid modules Hold's grids use, registered once for all of them: client-side rows, choosing rows, the row API,
// cell styles, and for the price list editor, editing text and a choice in a cell and dragging rows into order. The
// validation module explains a misconfiguration while developing and is left out of a build.
export function registerGridModules(): void {
  ModuleRegistry.registerModules([ClientSideRowModelModule, RowSelectionModule, RowApiModule, CellStyleModule, TextEditorModule, SelectEditorModule, RowDragModule, ...(process.env.NODE_ENV === 'production' ? [] : [ValidationModule])])
}
