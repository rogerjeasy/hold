import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // The workspace packages are TypeScript sources, compiled with the app.
  transpilePackages: ['@hold/auth', '@hold/config', '@hold/db', '@hold/domain'],
  // Loaded from node_modules when the server runs. PGlite finds its WebAssembly beside it, and only the test
  // environment loads it at all.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default withNextIntl(nextConfig)
