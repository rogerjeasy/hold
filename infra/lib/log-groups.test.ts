import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createHoldApp } from './hold-app.ts'

// Every function's logs expire (architecture.md section 17.1). CloudFormation can make the log groups only once
// HoldDelivery lets it, so they are made with "logRetention": "on" in cdk.json, and not before.

const recorded = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'cdk.context.json'), 'utf8')) as Record<string, unknown>
const build = (logRetention: 'on' | undefined) => {
  const context = { ...recorded, 'aws:cdk:bundling-stacks': [], ...(logRetention === undefined ? {} : { logRetention }) }
  const stacks = createHoldApp(new App({ context }), { senderEmail: 'codes@example.com', webImageTag: '0123456789abcdef0123456789abcdef01234567', webPublicUrl: 'https://abc123.us-east-1.awsapprunner.com' })
  return { resourceStacks: [stacks.data, stacks.identity, stacks.work, stacks.registry, stacks.web].map((each) => Template.fromStack(each.stack)), delivery: Template.fromStack(stacks.delivery.stack) }
}

type Resource = { readonly Type: string; readonly Properties?: Record<string, unknown> }
const resources = (template: Template) => Object.entries(template.toJSON().Resources as Record<string, Resource>)

describe('the functions’ logs', () => {
  const { resourceStacks, delivery } = build('on')

  it('go to a log group of Hold’s own that keeps them for one month, for every function', () => {
    let functions = 0
    for (const template of resourceStacks) {
      const all = resources(template)
      for (const [, resource] of all.filter(([, each]) => each.Type === 'AWS::Lambda::Function')) {
        functions += 1
        const functionName = resource.Properties?.['FunctionName']
        const reference = (resource.Properties?.['LoggingConfig'] as { LogGroup?: { Ref?: string } } | undefined)?.LogGroup?.Ref
        const group = all.find(([id]) => id === reference)?.[1]
        expect(group?.Type, String(functionName)).toBe('AWS::Logs::LogGroup')
        expect(group?.Properties).toMatchObject({ LogGroupName: `/hold/lambda/${String(functionName)}`, RetentionInDays: 30 })
      }
    }
    expect(functions).toBeGreaterThanOrEqual(15)
  })

  it('may be written by each function’s own role', () => {
    const work = resourceStacks[2]
    if (work === undefined) throw new Error('No work stack.')
    const group = resources(work).find(([, each]) => each.Type === 'AWS::Logs::LogGroup' && each.Properties?.['LogGroupName'] === '/hold/lambda/hold-worker-outbox-relay')?.[0]
    const writes = resources(work).filter(([id, each]) => each.Type === 'AWS::IAM::Policy' && id.startsWith('WorkerRole') && JSON.stringify(each).includes(`"${String(group)}"`))
    expect(group).toBeDefined()
    expect(JSON.stringify(writes)).toMatch(/logs:CreateLogStream.*logs:PutLogEvents|logs:PutLogEvents.*logs:CreateLogStream/)
  })

  it('are groups CloudFormation may make, under Hold’s own prefix only, once HoldDelivery is deployed', () => {
    const statements = JSON.stringify(delivery.toJSON())
    expect(statements).toMatch(/logs:CreateLogGroup[^}]*logs:PutRetentionPolicy[^}]*log-group:\/hold\/\*/)
    expect(statements).not.toMatch(/"logs:\*"/)
  })
})

describe('before HoldDelivery lets CloudFormation make log groups', () => {
  it('makes none, so the pipeline still deploys', () => {
    for (const template of build(undefined).resourceStacks) expect(resources(template).filter(([, each]) => each.Type === 'AWS::Logs::LogGroup')).toEqual([])
  })
})
