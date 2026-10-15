import { describe, expect, it } from 'vitest'
import { createMemoryMailer } from './mailer.ts'

const EMAIL = { to: 'ana@lisboa.example', subject: 'You are invited', text: 'Open the link.' }

describe('the memory mailer', () => {
  it('keeps what it was asked to send', async () => {
    const mailer = createMemoryMailer()
    await mailer.send(EMAIL)
    expect(mailer.sent).toEqual([EMAIL])
  })
})
