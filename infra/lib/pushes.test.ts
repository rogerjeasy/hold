import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'

// Push notifications to Hold's phone app through Expo (architecture.md section 13.9): every place that pushes reads
// the Expo access token, and nothing else of push is granted.
const context = { ...(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>), 'aws:cdk:bundling-stacks': [] }
const app = createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: '0123456789abcdef0123456789abcdef01234567', webPublicUrl: 'https://hold.example' })
const work = Template.fromStack(app.work.stack)
const web = Template.fromStack(app.web.stack)

type Statement = { Action: string | string[]; Resource: unknown }
const policyStatements = (template: Template, rolePrefix: string): Statement[] =>
  Object.entries(template.findResources('AWS::IAM::Policy')).filter(([key]) => key.startsWith(rolePrefix)).flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement)
const readsPushSecret = (template: Template, role: string) =>
  policyStatements(template, role).some((statement) => [statement.Action].flat().includes('secretsmanager:GetSecretValue') && JSON.stringify(statement.Resource).includes('hold/notify/expo-push-access-token'))

describe('push notifications', () => {
  it('let the web app and every worker that tells people read the Expo access token', () => {
    for (const [template, role] of [[web, 'InstanceRole'], [work, 'WorkerRole'], [work, 'ReceiptRole'], [work, 'OperationsRole'], [work, 'ComparisonRole']] as const) expect(readsPushSecret(template, role), role).toBe(true)
    for (const role of ['NegotiationRole', 'EvidenceRole']) expect(readsPushSecret(work, role), role).toBe(false)
  })

  it('name the secret to the functions that push', () => {
    for (const name of ['hold-worker-comparisons', 'hold-worker-receipts']) {
      const fn = Object.values(work.findResources('AWS::Lambda::Function', { Properties: { FunctionName: name } }))[0] as { Properties: { Environment: { Variables: Record<string, unknown> } } } | undefined
      expect(fn?.Properties.Environment.Variables['HOLD_PUSH_SECRET'], name).toBe('hold/notify/expo-push-access-token')
    }
    expect(JSON.stringify(web.toJSON())).toContain('"HOLD_PUSH_SECRET"')
  })
})
