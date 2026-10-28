// Bryntum Scheduler's own browser build, which the calendar loads from Hold's origin instead of bundling it
// (bryntum-loader.ts). scripts/vendor-bryntum.ts copies these files from the installed package to public/ before each
// build, at the same paths under BRYNTUM_PATH.
export const BRYNTUM_PATH = '/vendor/bryntum'

// In this order: the locales register themselves with the scheduler loaded before them.
export const BRYNTUM_SCRIPTS = ['scheduler.umd.js', 'locales/scheduler.locale.De.js', 'locales/scheduler.locale.Es.js', 'locales/scheduler.locale.FrFr.js'] as const

export const BRYNTUM_STYLES = ['scheduler.css', 'stockholm-light.css', 'fontawesome/css/fontawesome.css', 'fontawesome/css/solid.css'] as const

// The styles above name only the solid icon font.
export const BRYNTUM_FILES = [...BRYNTUM_SCRIPTS, ...BRYNTUM_STYLES, 'fontawesome/webfonts/fa-solid-900.woff2', 'fontawesome/webfonts/fa-solid-900.ttf'] as const
