import { ResourceExistsException } from '@aws-sdk/client-secrets-manager'
import { describe, expect, it } from 'vitest'
import { createMemoryCredentialStore, createSecretsManagerCredentialStore } from './credential-store.ts'

const CREDENTIALS = { clientId: 'sandbox-client', clientSecret: 'sandbox-secret' }

function secretsManager(replies: readonly (Record<string, unknown> | Error)[]) {
  const sent: { command: string; input: Record<string, unknown> }[] = []
  let next = 0
  const client = {
    send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      sent.push({ command: command.constructor.name, input: command.input })
      const reply = replies[next++] ?? {}
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    },
  }
  return { store: createSecretsManagerCredentialStore('us-east-1', client), sent }
}

describe('the Secrets Manager credential store', () => {
  it('keeps each shop’s credentials in a secret of its own, tagged as Hold’s', async () => {
    const { store, sent } = secretsManager([{}])

    expect(await store.save('shop-1', 'sandbox', CREDENTIALS)).toBe('hold/paypal/shops/shop-1/sandbox')
    expect(sent[0]).toMatchObject({ command: 'CreateSecretCommand', input: { Name: 'hold/paypal/shops/shop-1/sandbox', Tags: [{ Key: 'project', Value: 'hold' }] } })
  })

  it('replaces the credentials when a shop connects again', async () => {
    const { store, sent } = secretsManager([new ResourceExistsException({ message: 'exists', $metadata: {} }), {}])

    await store.save('shop-1', 'sandbox', CREDENTIALS)
    expect(sent.map((call) => call.command)).toEqual(['CreateSecretCommand', 'PutSecretValueCommand'])
  })

  it('reads credentials back, and nothing from a secret of another shape', async () => {
    expect(await secretsManager([{ SecretString: JSON.stringify(CREDENTIALS) }]).store.read('ref')).toEqual(CREDENTIALS)
    expect(await secretsManager([{ SecretString: JSON.stringify({ password: 'x' }) }]).store.read('ref')).toBeUndefined()
  })
})

describe('the memory credential store', () => {
  it('reads back what it saved', async () => {
    const store = createMemoryCredentialStore()
    expect(await store.read(await store.save('shop-1', 'sandbox', CREDENTIALS))).toEqual(CREDENTIALS)
  })
})
