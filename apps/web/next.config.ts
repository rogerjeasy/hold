import { resolve } from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // The workspace packages are TypeScript sources, compiled with the app.
  transpilePackages: ['@hold/auth', '@hold/compare', '@hold/config', '@hold/db', '@hold/domain', '@hold/evidence', '@hold/notify', '@hold/paypal', '@hold/vision'],
  // Loaded from node_modules when the server runs. PGlite finds its WebAssembly beside it, and only the test
  // environment loads it at all.
  serverExternalPackages: ['@electric-sql/pglite'],
  // OpenCV.js, measured in a worker on the phone, names Node's file system for when it runs in Node. In the browser it
  // never calls it.
  turbopack: { resolveAlias: { fs: { browser: './src/lib/empty-module.ts' } } },
  // The same browser-only fallback lets the build be checked with Webpack when Turbopack cannot open its IPC port.
  webpack(configuration: { resolve: { fallback?: Record<string, unknown> } }, { isServer }) {
    if (!isServer) configuration.resolve.fallback = { ...configuration.resolve.fallback, fs: false }
    return configuration
  },
  // The container image runs the app as one self-contained server (Dockerfile). Only its build asks for that, so
  // `next start` keeps working for the end-to-end tests. The workspace root is traced, for the shared packages.
  ...(process.env['HOLD_STANDALONE'] === '1' ? { output: 'standalone' as const, outputFileTracingRoot: resolve(process.cwd(), '../..') } : {}),
}

export default withNextIntl(nextConfig)
