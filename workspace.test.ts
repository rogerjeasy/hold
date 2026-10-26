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
