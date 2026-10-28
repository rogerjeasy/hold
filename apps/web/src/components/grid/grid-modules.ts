import { CellStyleModule, ClientSideRowModelModule, ModuleRegistry, RowApiModule, RowSelectionModule, ValidationModule } from 'ag-grid-community'

// The AG Grid modules Hold's grids use, registered once for all of them: client-side rows, choosing rows, the row API
// and cell styles. The validation module explains a misconfiguration while developing and is left out of a build.
export function registerGridModules(): void {
  ModuleRegistry.registerModules([ClientSideRowModelModule, RowSelectionModule, RowApiModule, CellStyleModule, ...(process.env.NODE_ENV === 'production' ? [] : [ValidationModule])])
}
