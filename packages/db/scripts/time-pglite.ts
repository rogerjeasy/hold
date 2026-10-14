import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
let t = performance.now()
const client = new PGlite()
await client.waitReady
console.log('start', Math.round(performance.now() - t)); t = performance.now()
await migrate(drizzle({ client }), { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
console.log('migrate', Math.round(performance.now() - t)); t = performance.now()
const dump = await client.dumpDataDir('none')
console.log('dump', Math.round(performance.now() - t), dump.size); t = performance.now()
const copy = new PGlite({ loadDataDir: dump })
await copy.waitReady
console.log('load', Math.round(performance.now() - t))
