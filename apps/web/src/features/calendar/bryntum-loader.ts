import { BRYNTUM_PATH, BRYNTUM_SCRIPTS, BRYNTUM_STYLES } from './bryntum-assets'

// What Bryntum's browser build puts on window.bryntum.scheduler: the same exports as its module, typed from it. Only the
// types are imported, so the bundler never processes Bryntum (bryntum-assets.test.ts).
export type BryntumScheduler = typeof import('@bryntum/scheduler')

let loading: Promise<BryntumScheduler> | undefined

function addStyle(file: string) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${BRYNTUM_PATH}/${file}`
  document.head.append(link)
}

function runScript(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${BRYNTUM_PATH}/${file}`
    script.addEventListener('load', () => {
      resolve()
    })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error(`Bryntum's ${file} did not load.`))
    })
    document.head.append(script)
  })
}

async function load(): Promise<BryntumScheduler> {
  if (document.querySelector(`link[href^="${BRYNTUM_PATH}/"]`) === null) BRYNTUM_STYLES.forEach(addStyle)
  for (const file of BRYNTUM_SCRIPTS) await runScript(file)
  const scheduler = (window as { bryntum?: { scheduler?: BryntumScheduler } }).bryntum?.scheduler
  if (scheduler === undefined) throw new Error('Bryntum loaded without its scheduler.')
  return scheduler
}

// Bryntum's browser build, loaded once per page. A failed load is forgotten, so the next calendar tries again.
export function loadBryntum(): Promise<BryntumScheduler> {
  loading ??= load().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
