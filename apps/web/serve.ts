// Starts the container's server the way `next start` does: listening on every interface, without naming a host.
// The standalone server.js that Next.js generates names one (HOSTNAME, or 0.0.0.0), and then checks every rewrite
// against http://0.0.0.0, while the proxy sees http://localhost. Each language rewrite then looks like another site
// and loops. Docker also sets HOSTNAME to the container's id, so it cannot simply be left out. Copied into the image
// beside server.js by the Dockerfile, and run by Node, which reads TypeScript.
import { readFileSync } from 'node:fs'
import module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type StartServer = (options: {
  dir: string
  isDev: boolean
  config: unknown
  hostname: string | undefined
  port: number
  allowRetry: boolean
}) => Promise<void>

const require = module.createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))

// NODE_ENV=production comes from the image.
process.chdir(dir)

const serverFiles = JSON.parse(readFileSync(path.join(dir, '.next', 'required-server-files.json'), 'utf8')) as { config: unknown }
process.env['__NEXT_PRIVATE_STANDALONE_CONFIG'] = JSON.stringify(serverFiles.config)

require('next')
const { startServer } = require('next/dist/server/lib/start-server') as { startServer: StartServer }

const port = Number.parseInt(process.env['PORT'] ?? '', 10) || 3000
startServer({ dir, isDev: false, config: serverFiles.config, hostname: undefined, port, allowRetry: false }).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
