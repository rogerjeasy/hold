// The one place that says where Hold runs and what its resources are called. Hold shares an AWS account with
// other projects (Wick, CareCircle), so every name starts with this prefix, every resource carries the project tag,
// and nothing here refers to another project's resources.

export const PREFIX = 'hold'
export const ACCOUNT = '707938860881'
export const REGION = 'us-east-1'

export const TAGS: Readonly<Record<string, string>> = {
  project: PREFIX,
  managed_by: 'cdk',
}

// Object Lock keeps an evidence photograph from being changed or deleted for this long after it is written.
// PayPal accepts a dispute for up to 180 days after a payment. The retention a shop states may lengthen it
// (architecture.md section 22.2). Governance mode, so a mistake during the hackathon can still be undone by an
// administrator. Compliance mode cannot be undone by anyone, the account's root user included.
export const EVIDENCE_RETENTION_DAYS = 180

// Aurora capacity units. Zero lets the cluster pause when idle. Raise the minimum above zero for judging, so a
// judge's first visit does not wait for the database to resume (tech-stack.md section 10).
export const DATABASE_MIN_CAPACITY = 0
export const DATABASE_MAX_CAPACITY = 2
// Not `hold`, which Aurora PostgreSQL reserves (SQL's WITH HOLD).
export const DATABASE_NAME = 'hold_db'
// The role the application connects as. It does not own the tables, so row-level security applies to it.
export const DATABASE_APP_USER = 'hold_app'
export const DATABASE_ADMIN_USER = 'hold_admin'

export function name(...parts: readonly string[]): string {
  return [PREFIX, ...parts].join('-')
}

export function secretName(...parts: readonly string[]): string {
  return [PREFIX, ...parts].join('/')
}

// The repository GitHub Actions deploys from. Only its main branch may take the deploy role.
export const GITHUB_REPOSITORY = 'rogerjeasy/hold'
// The account's CDK bootstrap, shared with the other projects. Its roles do the deploying.
export const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds'
