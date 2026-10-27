// The one place that says where Hold runs and what its resources are called. Hold shares an AWS account with
// other projects (Wick, CareCircle), so every name starts with this prefix, every resource carries the project tag,
// and nothing here refers to another project's resources.

export const PREFIX = 'hold'
export const ACCOUNT = '707938860881'
export const REGION = 'us-east-1'
// Claude Opus 4.6 through its US inference profile, while AWS holds this account's Opus 5.5 quota at zero
// (tech-stack.md section 16). The profile may send a call to any of these regions, so a role needs the model in each.
const CLAUDE_PROFILE = 'us.anthropic.claude-opus-4-6-v1'
const CLAUDE_PROFILE_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2'] as const
export const CLAUDE_INVOKE_ACTIONS = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream']
export const CLAUDE_INVOKE_RESOURCES = [
  `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${CLAUDE_PROFILE}`,
  ...CLAUDE_PROFILE_REGIONS.map((region) => `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-opus-4-6-v1`),
]

export const TAGS: Readonly<Record<string, string>> = {
  project: PREFIX,
  managed_by: 'cdk',
}

// Object Lock keeps an evidence photograph from being changed or deleted for this long after it is written.
// PayPal accepts a dispute for up to 180 days after a payment. The retention a shop states may lengthen it
// (architecture.md section 22.2). Governance mode, so a mistake during the hackathon can still be undone by an
// administrator. Compliance mode cannot be undone by anyone, the account's root user included.
export const EVIDENCE_RETENTION_DAYS = 180

// Aurora capacity units. Zero lets the cluster pause when idle. Set the minimum to 0.5 for the judging weeks, 1 to 15
// December 2026, and back to zero on 16 December, so a judge's first visit does not wait for the database to resume
// (tech-stack.md section 18).
export const DATABASE_MIN_CAPACITY = 0
export const DATABASE_MAX_CAPACITY = 2
// Not `hold`, which Aurora PostgreSQL reserves (SQL's WITH HOLD).
export const DATABASE_NAME = 'hold_db'
// The role the application connects as. It does not own the tables, so row-level security applies to it.
export const DATABASE_APP_USER = 'hold_app'
export const DATABASE_ADMIN_USER = 'hold_admin'
export const DATABASE_WORKER_USER = 'hold_worker'
// The evaluation runner's login: it records runs of the comparison's scorecard and reads them (extensions.md 5.6).
export const DATABASE_EVAL_USER = 'hold_eval'

export function name(...parts: readonly string[]): string {
  return [PREFIX, ...parts].join('-')
}

export function secretName(...parts: readonly string[]): string {
  return [PREFIX, ...parts].join('/')
}

// The SMTP account Hold sends email through: {host, port, user, password} as JSON. An administrator creates and
// fills it from the Gmail app password, so the password is in no file, template or setting.
export const SMTP_SECRET_NAME = secretName('email', 'smtp')

// The demo accounts judges sign in to with one tap, as JSON {owner, staff: {email, password}} (architecture.md section
// 20.3). The reset script (pnpm demo:reset) makes it as an administrator; the web app only reads it. Naming it to the web
// app turns the demo sign-in on: drop the setting in web-stack.ts once judging ends, and the sign-in page offers none.
export const DEMO_ACCOUNTS_SECRET_NAME = secretName('web', 'demo-accounts')

// The KMS key Cognito encrypts sign-in codes with for the code sender (alias/hold-code-key). An administrator made it,
// tagged project=hold and rotating, because the pipeline may not tag a key: that would let it claim another project's.
export const CODE_KEY_ARN = 'arn:aws:kms:us-east-1:707938860881:key/ff9a40c3-97d9-4262-8954-20331622e005'

// The KMS key that signs Clean Record credentials (extensions.md section 7.7): asymmetric, ECC_NIST_P256, SIGN_VERIFY.
// Like the code key, an administrator makes it, tagged project=hold, because the pipeline may not make or tag a key:
//   aws kms create-key --key-spec ECC_NIST_P256 --key-usage SIGN_VERIFY --tags TagKey=project,TagValue=hold \
//     --description 'Hold: signs Clean Record credentials'
//   aws kms create-alias --alias-name alias/hold-credential-key --target-key-id <the new key's id>
// The web app names it by this alias, and may sign with it only through the alias.
export const CREDENTIAL_KEY_ALIAS = 'alias/hold-credential-key'

// The repository GitHub Actions deploys from. Only its main branch may take the deploy role. The repository uses
// GitHub's immutable subject, which names the owner and the repository by their ids as well, so a renamed or
// recreated repository of the same name does not match.
export const GITHUB_REPOSITORY = 'rogerjeasy/hold'
export const GITHUB_DEPLOY_SUBJECT = 'repo:rogerjeasy@58919295/hold@1418569084:ref:refs/heads/main'
// Every role Hold's stacks make carries this boundary, so none can reach beyond Hold (infra/lib/delivery-stack.ts).
export const PERMISSIONS_BOUNDARY = 'hold-permissions-boundary'
// The account's CDK bootstrap, shared with the other projects. Hold uses only its bucket, under a prefix of its own,
// and deploys with the caller's credentials and Hold's own CloudFormation role, never the bootstrap's roles, which
// could deploy any stack in the account (infra/lib/delivery-stack.ts).
export const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds'
export const CDK_ASSETS_BUCKET = `cdk-${CDK_BOOTSTRAP_QUALIFIER}-assets-${ACCOUNT}-${REGION}`
export const CDK_ASSETS_PREFIX = 'hold/'
// The stacks GitHub Actions deploys. HoldDelivery, which holds the pipeline's own roles, is not among them.
export const PIPELINE_STACKS = ['HoldData', 'HoldIdentity', 'HoldWork', 'HoldRegistry', 'HoldWeb'] as const
