import { createHash } from 'node:crypto'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../schema/index.ts'

// Built from the file's path rather than `new URL(..., import.meta.url)`, which a bundler takes for an asset import.
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

export type TestDatabase = PgliteDatabase<typeof schema> & { readonly $client: PGlite }

// Starting PostgreSQL in WebAssembly and migrating it takes many seconds, so the migrated database is saved once
// to the temporary folder, named by the migrations it holds, and every later test database starts from that copy.
async function migratedCopyPath(): Promise<string> {
  const hash = createHash('sha256')
  for (const name of (await readdir(MIGRATIONS, { recursive: true })).sort()) {
    if (name.endsWith('.sql') || name.endsWith('.json')) hash.update(name).update(await readFile(join(MIGRATIONS, name)))
  }
  return join(tmpdir(), `hold-test-database-${hash.digest('hex').slice(0, 16)}.tar.gz`)
}

async function migratedCopy(): Promise<Blob | undefined> {
  try {
    return new Blob([await readFile(await migratedCopyPath())])
  } catch {
    return undefined
  }
}

async function saveMigratedCopy(client: PGlite): Promise<void> {
  const path = await migratedCopyPath()
  const partial = `${path}.${String(process.pid)}.partial`
  await writeFile(partial, Buffer.from(await (await client.dumpDataDir('gzip')).arrayBuffer()))
  // Renamed into place in one step, so a test running beside this one never reads half a file.
  await rename(partial, path)
}

// A real PostgreSQL running in this process, with every migration applied. The connection is the table owner,
// which row-level security does not filter, so tests seed through it and act through inShop.
export async function createTestDatabase(): Promise<TestDatabase> {
  const copy = await migratedCopy()
  const client = copy === undefined ? new PGlite() : new PGlite({ loadDataDir: copy })
  const database = drizzle({ client, schema, casing: 'snake_case' })
  if (copy === undefined) {
    await migrate(database, { migrationsFolder: MIGRATIONS })
    await saveMigratedCopy(client)
  }
  return database
}
