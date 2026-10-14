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

createHoldApp(app, { senderEmail, passkeyRelyingPartyId })
app.synth()
