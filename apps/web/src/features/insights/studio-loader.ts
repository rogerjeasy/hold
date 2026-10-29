import { STUDIO_SCRIPT } from './studio-assets'

// What AG Studio's browser build puts on window.agStudio: the same exports as its module, typed from it. Only the types
// are imported, so the bundler never processes AG Studio (studio-assets.test.ts).
export type AgStudioGlobal = typeof import('ag-studio')

let loading: Promise<AgStudioGlobal> | undefined

function load(): Promise<AgStudioGlobal> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = STUDIO_SCRIPT
    script.addEventListener('load', () => {
      const studio = (window as { agStudio?: AgStudioGlobal }).agStudio
      if (studio === undefined) reject(new Error('AG Studio loaded without its exports.'))
      else resolve(studio)
    })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error('AG Studio’s browser build did not load.'))
    })
    document.head.append(script)
  })
}

// AG Studio's browser build, loaded once per page. A failed load is forgotten, so the next dashboard tries again.
export function loadStudio(): Promise<AgStudioGlobal> {
  loading ??= load().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
