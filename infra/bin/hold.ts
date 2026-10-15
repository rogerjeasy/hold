import { App } from 'aws-cdk-lib'
import { createHoldApp } from '../lib/hold-app.ts'

// The address Cognito sends sign-in codes from, read from the CDK context:
//   "senderEmail" in cdk.json, or -c senderEmail=<address> to override it
const app = new App()
const senderEmail: unknown = app.node.tryGetContext('senderEmail')
if (typeof senderEmail !== 'string' || !senderEmail.includes('@')) {
  throw new Error('Set the sign-in sender address: -c senderEmail=<address>, or "senderEmail" in cdk.context.json.')
}

// The domain passkeys are made for. A browser offers a passkey only on that domain, so this follows the web app's
// address: localhost while it runs on a developer's machine, its own domain once deployed.
const passkeyRelyingPartyId: unknown = app.node.tryGetContext('passkeyRelyingPartyId')
if (typeof passkeyRelyingPartyId !== 'string' || passkeyRelyingPartyId === '') {
  throw new Error('Set the passkey domain: -c passkeyRelyingPartyId=<domain>, or "passkeyRelyingPartyId" in cdk.json.')
}

// The commit whose image the web app runs: the deploy passes -c webImageTag=<commit>, the image CI built and pushed.
const webImageTag: unknown = app.node.tryGetContext('webImageTag')
if (typeof webImageTag !== 'string' || !/^[0-9a-f]{40}$/.test(webImageTag)) {
  throw new Error('Name the image the web app runs: -c webImageTag=<commit>, a commit whose image is in hold-app.')
}

// The web app's own address, "webPublicUrl" in cdk.json. App Runner gives it only once the service exists.
const webPublicUrl: unknown = app.node.tryGetContext('webPublicUrl')
if (webPublicUrl !== undefined && (typeof webPublicUrl !== 'string' || !webPublicUrl.startsWith('https://'))) {
  throw new Error('"webPublicUrl" in cdk.json is the web app\'s https:// address.')
}

createHoldApp(app, { senderEmail, passkeyRelyingPartyId, webImageTag, webPublicUrl })
app.synth()
