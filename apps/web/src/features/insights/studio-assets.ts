// AG Studio's own browser build, which the insights dashboard loads from Hold's origin instead of bundling it
// (studio-loader.ts). scripts/vendor-ag-studio.ts copies it from the installed package to public/ before each build.
// It carries its own AG Grid and AG Charts, apart from the copies the app's grids bundle.
export const STUDIO_PATH = '/vendor/ag-studio'
export const STUDIO_FILE = 'dist/umd/ag-studio.min.js'
export const STUDIO_SCRIPT = `${STUDIO_PATH}/ag-studio.min.js`
