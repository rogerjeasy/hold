import { describe, expect, it } from 'vitest'
import { isDemoSessionAddress } from '../demo-accounts.ts'
import { createDemoAccountRemoval } from './demo-account-removal.ts'

type Sent = { readonly command: string; readonly input: Record<string, unknown> }

function cognito(reply: Record<string, unknown> | Error) {
  const sent: Sent[] = []
  const client = {
    send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      sent.push({ command: command.constructor.name, input: command.input })
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    },
  }
  return { removal: createDemoAccountRemoval({ region: 'us-east-1', userPoolId: 'us-east-1_2kEqBx3YP' }, client), sent }
}

const named = (name: string) => Object.assign(new Error(name), { name })

describe('removing a retired demo’s accounts', () => {
  it('deletes the account from the user pool by its address', async () => {
    const { removal, sent } = cognito({})

    await removal.remove('tomas.k3v9q2@demo.hold.example')

    expect(sent).toEqual([{ command: 'AdminDeleteUserCommand', input: { UserPoolId: 'us-east-1_2kEqBx3YP', Username: 'tomas.k3v9q2@demo.hold.example' } }])
  })

  it('counts an account already gone as removed, so a cleanup can run again', async () => {
    const { removal } = cognito(named('UserNotFoundException'))

    await expect(removal.remove('jonas.k3v9q2@demo.hold.example')).resolves.toBeUndefined()
  })

  it('passes on any other failure, so the shop is not marked retired while its accounts remain', async () => {
    const { removal } = cognito(named('TooManyRequestsException'))

    await expect(removal.remove('jonas.k3v9q2@demo.hold.example')).rejects.toThrow('TooManyRequestsException')
  })

  it('refuses an address outside the demo’s domain before Cognito is called', async () => {
    const { removal, sent } = cognito({})

    await expect(removal.remove('ana@douro.example')).rejects.toThrow('demo.hold.example')
    await expect(removal.remove('tomas.x@demo.hold.example.evil.example')).rejects.toThrow()
    expect(sent).toEqual([])
  })

  it('knows a demo account by its domain alone', () => {
    expect(isDemoSessionAddress('tomas.k3v9q2@demo.hold.example')).toBe(true)
    expect(isDemoSessionAddress('Tomas.K3V9Q2@Demo.Hold.Example')).toBe(true)
    expect(isDemoSessionAddress('ana@douro.example')).toBe(false)
    expect(isDemoSessionAddress('ana@notdemo.hold.example')).toBe(false)
  })
})
