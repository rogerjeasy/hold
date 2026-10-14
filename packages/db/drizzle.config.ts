import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  // The roles are created by the first migration, so drizzle-kit only refers to them.
  entities: { roles: true },
})
