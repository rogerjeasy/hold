import type { TestDatabase } from './test-database.ts'

// What a read costs where Hold is deployed. On the RDS Data API every statement is an HTTPS call of its own, and so
// are the start and the end of each transaction, so a page waits for each one in turn (tech-stack.md section 10).
// Transactions run side by side cost the page only their longest, which `longest` counts: the most statements any one
// of them sent, the statement that binds it to a shop included.
export type StatementCount = { readonly statements: number; readonly transactions: number; readonly longest: number }

type Query = (...args: unknown[]) => Promise<unknown>
type Client = { query: Query; transaction: (callback: (transaction: { query: Query }) => Promise<unknown>) => Promise<unknown> }

// Counts the statements and transactions the work sends through the test database's client, which every statement
// passes. The client is put back as it was afterwards.
export async function countStatements<Result>(database: TestDatabase, work: () => Promise<Result>): Promise<{ readonly result: Result; readonly count: StatementCount }> {
  const client = database.$client as unknown as Client
  const { query, transaction } = client
  let statements = 0
  let transactions = 0
  let longest = 0
  client.query = (...args) => {
    statements += 1
    return query.apply(client, args)
  }
  client.transaction = (callback) => {
    transactions += 1
    let inThis = 0
    return transaction.call(client, (open) => {
      const inner = open.query
      open.query = (...args) => {
        statements += 1
        inThis += 1
        longest = Math.max(longest, inThis)
        return inner.apply(open, args)
      }
      return callback(open)
    })
  }
  try {
    return { result: await work(), count: { statements, transactions, longest } }
  } finally {
    client.query = query
    client.transaction = transaction
  }
}
