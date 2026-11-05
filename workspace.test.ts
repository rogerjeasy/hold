import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = import.meta.dirname
const scope = '@hold/'

function foldersIn(parent: string): string[] {
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name))
}

const apps = foldersIn('apps')
const workspaceFolders = [...apps, ...foldersIn('packages'), 'infra', 'eval']
const appNames = apps.map((folder) => scope + basename(folder))

function readManifest(folder: string): unknown {
  return JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'))
}

function field(manifest: unknown, name: string): unknown {
  return typeof manifest === 'object' && manifest !== null
    ? Reflect.get(manifest, name)
    : undefined
}

function dependencyNames(manifest: unknown, kind: string): string[] {
  const dependencies = field(manifest, kind)
  return typeof dependencies === 'object' && dependencies !== null
    ? Object.keys(dependencies)
    : []
}

describe('workspace layout', () => {
  it.each(workspaceFolders)('%s is a package named after its folder', (folder) => {
    expect(field(readManifest(folder), 'name')).toBe(scope + basename(folder))
  })

  it('domain depends on nothing at run time and on no other Hold package', () => {
    const manifest = readManifest('packages/domain')

    expect(dependencyNames(manifest, 'dependencies')).toEqual([])
    expect(dependencyNames(manifest, 'peerDependencies')).toEqual([])
    expect(
      dependencyNames(manifest, 'devDependencies').filter((name) => name.startsWith(scope)),
    ).toEqual([])
  })

  it('trust depends on no Hold package but domain and db (extensions.md section 4.5)', () => {
    const manifest = readManifest('packages/trust')
    const all = [...dependencyNames(manifest, 'dependencies'), ...dependencyNames(manifest, 'devDependencies')]

    expect(all.filter((name) => name.startsWith(scope)).sort()).toEqual(['@hold/db', '@hold/domain'])
  })

  it('mcp depends on no Hold package but auth, db and domain: PayPal is reached through the ports the app gives it', () => {
    const manifest = readManifest('packages/mcp')
    const all = [...dependencyNames(manifest, 'dependencies'), ...dependencyNames(manifest, 'devDependencies')]

    expect(all.filter((name) => name.startsWith(scope)).sort()).toEqual(['@hold/auth', '@hold/db', '@hold/domain'])
  })

  it('negotiate depends on no Hold package but domain and db, never on another extension (extensions.md section 4.5)', () => {
    const manifest = readManifest('packages/negotiate')
    const all = [...dependencyNames(manifest, 'dependencies'), ...dependencyNames(manifest, 'devDependencies')]

    expect(all.filter((name) => name.startsWith(scope)).sort()).toEqual(['@hold/db', '@hold/domain'])
  })

  it.each(workspaceFolders)('%s does not depend on an app', (folder) => {
    const manifest = readManifest(folder)
    const all = [
      ...dependencyNames(manifest, 'dependencies'),
      ...dependencyNames(manifest, 'devDependencies'),
      ...dependencyNames(manifest, 'peerDependencies'),
    ]

    expect(all.filter((name) => appNames.includes(name))).toEqual([])
  })
})

// What CI enforces (AGENTS.md sections 2 and 12): the whole unit suite, lint and the phone app's tests on every push,
// with the full end-to-end suite every night. Read as text: the workflows are YAML the tests never execute.
const workflow = (name: string) => readFileSync(join(root, '.github', 'workflows', name), 'utf8')
const scriptOf = (name: string): unknown => Reflect.get(field(readManifest('.'), 'scripts') as object, name)

describe('what CI enforces', () => {
  it('lints with a heap large enough for the whole repository, so pnpm check passes on a default Node', () => {
    expect(scriptOf('lint')).toMatch(/NODE_OPTIONS=--max-old-space-size=8192 eslint \./)
  })

  it('runs lint, every unit test and the phone app\'s tests on every push, before main deploys', () => {
    const ci = workflow('ci.yml')
    for (const command of ['run: pnpm lint', 'run: pnpm test\n', 'run: pnpm test:mobile', 'run: pnpm typecheck', 'run: pnpm test:e2e:key']) expect(ci).toContain(command)
    expect(workflow('deploy.yml')).toMatch(/workflow_run:\s+workflows: \[CI\]/)
  })

  it('runs the full end-to-end suite, every page at every width, on every push to main and on demand, not on a timer', () => {
    const full = workflow('e2e-full.yml')
    expect(full).toMatch(/push:\s+branches: \[main\]/)
    expect(full).not.toContain('schedule:')
    expect(full).toContain('workflow_dispatch:')
    expect(full).toMatch(/concurrency:\s+group: e2e-full\s+cancel-in-progress: true/)
    expect(full).toContain('run: pnpm test:e2e\n')
    expect(full).toContain('HOLD_AG_GRID_LICENCE_KEY: ${{ secrets.AG_GRID_LICENCE_KEY }}')
  })
})
