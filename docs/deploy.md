# Deploying Hold to another AWS account

This is how to recreate Hold's deployment from the repository in an AWS account of your own. It names every step done
by hand, in the order that works. It holds no secret: each secret is named, and you choose or obtain its value.

The honest reproduction for a judge is still the local run on in-process fakes in the README, which needs no account.
This runbook is for someone who wants the real services: Aurora, Cognito, App Runner, Lambda, S3, Bedrock and
PayPal's sandbox.

Allow half a day. Most of it is waiting for AWS and PayPal.

## What you need

- An AWS account where you can act as an administrator, in a US region. The Claude inference profiles Hold calls start
  with `us.` and route only to `us-east-1`, `us-east-2` and `us-west-2` (`infra/lib/settings.ts`).
- The account's default VPC in that region. The database stack looks it up.
- The AWS CLI, Node 24, pnpm 12 and Docker.
- A GitHub repository of your own holding this code, if you want the pipeline. Without it, every deploy below is run
  by hand.
- A PayPal developer account with a sandbox business account and a sandbox personal account.
- An email account that can send over SMTP, such as a Gmail address with an app password. Sign-in codes go out
  through it.

## 1. Point the code at your account

Everything that names the account is in a few files. Change these before the first synth:

| File | What to change |
|---|---|
| `infra/lib/settings.ts` | `ACCOUNT` and `REGION`. `GITHUB_REPOSITORY` and `GITHUB_DEPLOY_SUBJECT`: the subject is `repo:<owner>@<owner id>/<repo>@<repo id>:ref:refs/heads/main`, GitHub's immutable form. `CODE_KEY_ARN`, once you have made that key in step 3. `CDK_BOOTSTRAP_QUALIFIER` only if your bootstrap uses another qualifier |
| `infra/cdk.json` | `senderEmail`, the address Cognito names as the sender (step 3). Remove `webPublicUrl` until step 6 gives you one |
| `infra/cdk.context.json` | Delete it. It records the default VPC of Hold's own account; the next synth looks yours up and writes it again |
| `infra/lib/hold-app.test.ts` and other infra tests | Several assertions name the account `707938860881` and the App Runner host. Update them to yours so `pnpm test infra` stays green |

Every resource name starts with `hold`, so the deployment can share an account with other projects. Nothing in it
refers to resources it did not make, except the ones you make by hand below.

## 2. Bootstrap CDK

```sh
cdk bootstrap aws://<account>/<region>
```

Hold uses only the bootstrap bucket, under its own `hold/` prefix, and deploys with your credentials or its own
CloudFormation role, never the bootstrap's roles.

## 3. Things an administrator makes by hand

The pipeline may not make these, because each would let it reach beyond Hold (`infra/lib/delivery-stack.ts`):

1. **The SES identity for `senderEmail`.** Verify the address in Amazon SES in your region. Cognito requires a
   verified identity before it allows email codes at all, although Hold sends nothing through SES.
2. **The SMTP login**, as a secret named `hold/email/smtp`, holding `{"host", "port", "user", "password"}` as JSON.
   Sign-in codes, invitations, receipts and reminders go out through it.
3. **The code key**, a symmetric KMS key tagged `project=hold`, with the alias `alias/hold-code-key`. Cognito encrypts
   each sign-in code with it for the code sender. Put its ARN in `CODE_KEY_ARN`.
4. **The credential key**, which signs Clean Record credentials and evidence statements:

   ```sh
   aws kms create-key --key-spec ECC_NIST_P256 --key-usage SIGN_VERIFY --tags TagKey=project,TagValue=hold \
     --description 'Hold: signs Clean Record credentials'
   aws kms create-alias --alias-name alias/hold-credential-key --target-key-id <the new key's id>
   ```

5. **Bedrock model access.** In the Bedrock console, make the account able to call Claude Opus 4.6
   (`us.anthropic.claude-opus-4-6-v1`, the photograph comparison) and Claude Opus 4.5
   (`us.anthropic.claude-opus-4-5-20251101-v1:0`, every agent), and accept their Marketplace terms if asked. Read the
   applied quotas in Service Quotas: an account whose daily token quota is zero for a model cannot call it, whatever
   IAM allows (`docs/tech-stack.md` section 6 and section 16, item 14). Hold works without Claude, with every
   comparison waiting for a person, but none of the AI features run.

## 4. The pipeline's roles: HoldDelivery

`HoldDelivery` makes the role GitHub Actions deploys with, the CloudFormation role it hands its changes to, the
comparison gate's role and the permissions boundary every other Hold role carries. Only an administrator deploys it,
so no commit can widen what the pipeline may do. Deploy it first, and again whenever `infra/lib/delivery-stack.ts`
changes:

```sh
cd infra
pnpm exec cdk deploy HoldDelivery -c webImageTag=0000000000000000000000000000000000000000
```

`webImageTag` must name a commit even when HoldWeb is not deployed; any 40-character value does here. The stack's
outputs are the ARNs the pipeline needs in step 7.

## 5. The first deploy, by hand

The pipeline pushes the image before it deploys the stacks, so on a new account the image repository and the database
must exist first. Run these with your administrator credentials:

```sh
cd infra
pnpm exec cdk deploy HoldData HoldIdentity HoldRegistry HoldWork -c webImageTag=<any commit>
```

Then, from the repository root:

1. **Migrate the database.** The cluster's ARN and the app login's secret are HoldData's outputs `DatabaseClusterArn`
   and `DatabaseAppSecretArn`; the owner's login is the secret `hold/database/admin`, whose ARN Secrets Manager shows:

   ```sh
   HOLD_DATABASE_CLUSTER_ARN=… HOLD_DATABASE_ADMIN_SECRET_ARN=… HOLD_DATABASE_APP_SECRET_ARN=… \
     pnpm --filter @hold/db migrate:aurora
   ```

   It applies every migration as `hold_admin` and gives `hold_app`, `hold_worker` and `hold_eval` their logins from
   the secrets HoldData made. It is safe to run again.

2. **Build and push the image**, tagged with the commit:

   ```sh
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker build --platform linux/amd64 --tag <account>.dkr.ecr.<region>.amazonaws.com/hold-app:<commit> .
   docker push <account>.dkr.ecr.<region>.amazonaws.com/hold-app:<commit>
   ```

   App Runner runs x86-64, so build for it. The repository's tags are immutable: one tag names one build.

3. **Deploy the web app:**

   ```sh
   cd infra
   pnpm exec cdk deploy HoldWeb -c webImageTag=<commit>
   ```

## 6. Give the app its own address

App Runner gives the service its address only once it exists. Read it from HoldWeb's `ServiceUrl` output and put it
in `infra/cdk.json` as `webPublicUrl`. Then deploy `HoldIdentity` and `HoldWeb` again, as in step 5. Passkeys are made
for that host, and the links in Hold's emails use it from then on. HoldWeb has termination protection, because a new
service would get a new address.

## 7. Connect the pipeline

In the GitHub repository's settings, add these **variables**, from the stacks' outputs:

| Variable | From |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | HoldDelivery `DeployRoleArn` |
| `AWS_CLOUDFORMATION_ROLE_ARN` | HoldDelivery `CloudFormationRoleArn` |
| `AWS_EVAL_ROLE_ARN` | HoldDelivery `EvalRoleArn`, for the comparison gate |
| `HOLD_DATABASE_CLUSTER_ARN` | HoldData `DatabaseClusterArn` |
| `HOLD_DATABASE_APP_SECRET_ARN` | HoldData `DatabaseAppSecretArn` |
| `HOLD_DATABASE_ADMIN_SECRET_ARN`, `HOLD_DATABASE_EVAL_SECRET_ARN` | The ARNs of the secrets `hold/database/admin` and `hold/database/eval`, which HoldData made |

And these **secrets**: `HOLD_ALARM_EMAIL`, the address alarms and the budget email (a secret only so Actions masks it
in the log); `AG_GRID_LICENCE_KEY` and `AG_STUDIO_LICENCE_KEY`, for CI's end-to-end tests of the grids, optional.

From then on, every push to `main` that passes CI runs `.github/workflows/deploy.yml`: migrations, the image, then the
five resource stacks through Hold's own CloudFormation role. HoldDelivery is never among them.

## 8. Secrets the app reads once it runs

The stacks make these with random values, kept if a stack is deleted. Put the real values in by hand:

| Secret | Holds | Without it |
|---|---|---|
| `hold/web/ag-grid-licence` | The AG Grid Enterprise key | The grids work and show AG Grid's watermark |
| `hold/web/ag-studio-licence` | The AG Studio key | The insights dashboard runs as AG Studio does without a key |
| `hold/notify/expo-push-access-token` | An Expo access token, for pushes to the phone app | Pushes go without one |

`hold/web/cookie-key`, `hold/web/renter-link-key` and `hold/web/trust-key` are made by HoldIdentity and need nothing.

## 9. PayPal's sandbox

1. In the PayPal developer dashboard, make a REST app on your sandbox **business** account. It stands in for a shop.
2. Store it as the demo's shared connection (`apps/web/scripts/demo-paypal.ts`):

   ```sh
   PAYPAL_SANDBOX_CLIENT_ID=… PAYPAL_SANDBOX_CLIENT_SECRET=… AWS_PROFILE=… pnpm --filter @hold/web demo:paypal
   ```

   It checks the credentials with PayPal first and keeps them only in Secrets Manager, as
   `hold/paypal/shops/demo/sandbox`.
3. **The webhook** needs no step by hand. Each demo start subscribes, or finds, the shared app's one webhook at
   `<webPublicUrl>/api/webhooks/paypal/demo`. A shop that connects its own app on `/shop/paypal` gets
   `<webPublicUrl>/api/webhooks/paypal/<account>`, subscribed when it connects. Both need `webPublicUrl` from step 6.
4. Use the sandbox **personal** account to approve fees and holds as a renter.

## 10. Optional, after the first deploy

- **Log retention.** Each function's logs expire after a month once CloudFormation makes their groups
  (`infra/lib/log-groups.ts`). Deploy HoldDelivery (step 4) with the log-group grant, then set
  `"logRetention": "on"` in `infra/cdk.json` and deploy. App Runner makes its own two log groups, named by the
  service's ID, so set theirs by hand:

  ```sh
  for group in $(aws logs describe-log-groups --log-group-name-prefix /aws/apprunner/hold-web/ \
      --query 'logGroups[].logGroupName' --output text); do
    aws logs put-retention-policy --log-group-name "$group" --retention-in-days 30
  done
  ```

  The groups Lambda made before, `/aws/lambda/hold-*`, stop receiving logs; give them the same retention, or delete
  them.
- **Texts to renters.** Register a sender in AWS End User Messaging, set `"textSender"` in `infra/cdk.json`, and, once
  HoldDelivery lets CloudFormation make the configuration set, `"textReports": "on"` (`infra/lib/texts.ts`).
- **Cost.** Aurora sits at 0.5 capacity units around the clock, because the outbox relay queries it every minute
  (`docs/tech-stack.md` section 18). `DATABASE_MIN_CAPACITY` and `DATABASE_MAX_CAPACITY` are in
  `infra/lib/settings.ts`, and the monthly budget's figure is `-c monthlyBudgetUsd=<amount>`.

## 11. Before a shop takes real money

None of this is built. Hold runs in PayPal's sandbox only, by configuration (`HOLD_PAYPAL_MODE` accepts `sandbox`
alone). A live shop would also need:

- PayPal's go-live steps for the app ([go live](https://developer.paypal.com/api/rest/production/)), a verified
  business account, and **partial capture switched on** for the shop's PayPal account, which a wallet-funded
  authorization needs before any partial capture ([Authorization and honor period](https://developer.paypal.com/payment-methods/auth-honor)).
- A plan for **card-funded holds**, which may last less than 29 days and may not renew (`docs/tech-stack.md`
  section 16, item 20).
- Its own deployment. Today the demo shops and any real shop share one deployment, one user pool and one database,
  walled off by row-level security.
- Shop terms and renter deposit terms, accepted and stored with their version and time.

## Checking it worked

- `<webPublicUrl>/api/health` answers `{"status":"ok"}`.
- `<webPublicUrl>/.well-known/jwks.json` answers a key set, which proves the credential key is reachable.
- **Start a demo as Jonas** on `/sign-in` opens a shop of your own; booking a rental and approving its fee with the
  sandbox personal account shows the fee as paid, which proves PayPal, the webhook and the read-back.
- The `hold-alarms` topic emails `HOLD_ALARM_EMAIL` when an alarm fires; confirm its subscription from the first email.
