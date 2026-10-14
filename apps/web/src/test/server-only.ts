// Stands in for the server-only package in unit tests. Next.js resolves the real one, which refuses to load in a
// browser bundle. Vitest resolves this, so server modules can be tested.
export {}
