import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSmtpMailer } from './smtp-mailer.ts'

const SETTINGS = { host: 'smtp.example.test', port: 465, user: 'hold@example.test', password: 'app-password' }
const EMAIL = { to: 'ana@lisboa.pt', subject: 'You are invited', text: 'Open the link.' }

describe('the SMTP mailer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends plain text from Hold, at the account it signs in to', async () => {
    const sent: unknown[] = []
    const mailer = createSmtpMailer(SETTINGS, { sendMail: (message) => (sent.push(message), Promise.resolve({})) })

    expect(await mailer.send(EMAIL)).toBe(true)
    expect(sent).toEqual([{ from: 'Hold <hold@example.test>', to: 'ana@lisboa.pt', subject: 'You are invited', text: 'Open the link.' }])
  })

  it('reports a message the server refused, instead of throwing, and logs neither the address nor the text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const mailer = createSmtpMailer(SETTINGS, { sendMail: () => Promise.reject(new Error('550 rejected ana@lisboa.pt')) })

    expect(await mailer.send(EMAIL)).toBe(false)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('email_failed')
    expect(logged).not.toContain('ana@lisboa.pt')
    expect(logged).not.toContain('Open the link')
  })

  it.each(['tomas.a6m279gw@demo.hold.example', 'elena.duarte@renter.invalid', 'ana@shop.test', 'ana@localhost', 'ana@EXAMPLE.com', 'ana@mail.example.org'])(
    'sends nothing to %s, a reserved domain no mail can reach, and reports it done so nothing tries again',
    async (to) => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const sent: unknown[] = []
      const mailer = createSmtpMailer(SETTINGS, { sendMail: (message) => (sent.push(message), Promise.resolve({})) })

      expect(await mailer.send({ ...EMAIL, to })).toBe(true)
      expect(sent).toEqual([])
      const logged = JSON.stringify(info.mock.calls)
      expect(logged).toContain('email_not_deliverable')
      expect(logged).not.toContain(to)
    },
  )

  it('still sends to a domain that only looks like a reserved one', async () => {
    const sent: unknown[] = []
    const mailer = createSmtpMailer(SETTINGS, { sendMail: (message) => (sent.push(message), Promise.resolve({})) })

    for (const to of ['ana@example.pt', 'ana@notexample.com', 'ana@invalid.pt']) expect(await mailer.send({ ...EMAIL, to })).toBe(true)
    expect(sent).toHaveLength(3)
  })
})
