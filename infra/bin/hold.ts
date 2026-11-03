import { App } from 'aws-cdk-lib'
import { createHoldApp } from '../lib/hold-app.ts'

// The address Cognito sends sign-in codes from, read from the CDK context:
//   "senderEmail" in cdk.json, or -c senderEmail=<address> to override it
const app = new App()
const senderEmail: unknown = app.node.tryGetContext('senderEmail')
if (typeof senderEmail !== 'string' || !senderEmail.includes('@')) {
  throw new Error('Set the sign-in sender address: -c senderEmail=<address>, or "senderEmail" in cdk.context.json.')
}

// The commit whose image the web app runs: the deploy passes -c webImageTag=<commit>, the image CI built and pushed.
const webImageTag: unknown = app.node.tryGetContext('webImageTag')
if (typeof webImageTag !== 'string' || !/^[0-9a-f]{40}$/.test(webImageTag)) {
  throw new Error('Name the image the web app runs: -c webImageTag=<commit>, a commit whose image is in hold-app.')
}

// The web app's own address, "webPublicUrl" in cdk.json. App Runner gives it only once the service exists. Passkeys
// are made for its host (lib/hold-app.ts).
const webPublicUrl: unknown = app.node.tryGetContext('webPublicUrl')
if (webPublicUrl !== undefined && (typeof webPublicUrl !== 'string' || !webPublicUrl.startsWith('https://'))) {
  throw new Error('"webPublicUrl" in cdk.json is the web app\'s https:// address.')
}

// Texts to renters (architecture.md section 12.3), in cdk.json: "textSender", the account's registered number or
// sender name once an administrator has one, and "textReports": "on" once HoldDelivery lets CloudFormation make the
// configuration set that reports each text's delivery.
const textSender: unknown = app.node.tryGetContext('textSender')
if (textSender !== undefined && (typeof textSender !== 'string' || textSender === '')) throw new Error('"textSender" in cdk.json is the sender name or number texts come from.')
const textReports: unknown = app.node.tryGetContext('textReports')

// Where alarms and the account's budget email: -c alarmEmail=<address>, which the deploy passes from a GitHub secret
// so no address is committed. Empty or unset, the alarms email nobody.
const alarmEmail: unknown = app.node.tryGetContext('alarmEmail')
if (alarmEmail !== undefined && alarmEmail !== '' && (typeof alarmEmail !== 'string' || !alarmEmail.includes('@'))) throw new Error('-c alarmEmail=<address> is the address alarms are emailed to.')

// The account's monthly cost the budget warns at, in US dollars: -c monthlyBudgetUsd=<amount>, or the default in lib/settings.ts.
const monthlyBudgetUsd: unknown = app.node.tryGetContext('monthlyBudgetUsd')
const budget = monthlyBudgetUsd === undefined ? undefined : Number(monthlyBudgetUsd)
if (budget !== undefined && !(Number.isFinite(budget) && budget > 0)) throw new Error('-c monthlyBudgetUsd=<amount> is a number of US dollars above zero.')

createHoldApp(app, { senderEmail, webImageTag, webPublicUrl, textSender, textReports: textReports === 'on', alarmEmail: alarmEmail === '' ? undefined : alarmEmail, monthlyBudgetUsd: budget })
app.synth()
