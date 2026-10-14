import { describe, expect, it } from 'vitest'
import { createMemoryMailer, createSesMailer } from './mailer.ts'

const EMAIL = { to: 'ana@lisboa.example', subject: 'You are invited', text: 'Open the link.' }

describe('the SES mailer', () => {
  it('sends plain text from Hold’s address', async () => {
    const sent: unknown[] = []
    const mailer = createSesMailer({ region: 'us-east-1', from: 'hold@example.test' }, { send: (command: { input: unknown }) => (sent.push(command.input), Promise.resolve({})) })

    expect(await mailer.send(EMAIL)).toBe(true)
    expect(sent[0]).toMatchObject({ FromEmailAddress: 'Hold <hold@example.test>', Destination: { ToAddresses: ['ana@lisboa.example'] } })
  })

  it('reports a message SES refused, instead of throwing', async () => {
    const mailer = createSesMailer({ region: 'us-east-1', from: 'hold@example.test' }, { send: () => Promise.reject(new Error('MessageRejected')) })

    expect(await mailer.send(EMAIL)).toBe(false)
  })
})

describe('the memory mailer', () => {
  it('keeps what it was asked to send', async () => {
    const mailer = createMemoryMailer()
    await mailer.send(EMAIL)
    expect(mailer.sent).toEqual([EMAIL])
  })
})
