import { EMAIL_LIMITS } from '@hold/domain'
import { createMemoryMailer } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodeSender } from './code-sender.ts'

const CODE = '24681357'
const ADDRESS = 'ana@lisboa.example'
// Stands in for KMS and the Encryption SDK: the event carries the code sealed, and decrypting unseals it.
const SEALED = `sealed:${CODE}`
const decrypt = (encrypted: string) => Promise.resolve(encrypted.replace(/^sealed:/, ''))

function event(triggerSource: string) {
  return { version: '1', triggerSource, region: 'us-east-1', userPoolId: 'us-east-1_EXAMPLE', userName: 'abc', request: { type: 'customEmailSenderRequestV1', code: SEALED, userAttributes: { email: ADDRESS } } }
}

describe('the code sender Cognito hands each code to', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(['CustomEmailSender_SignUp', 'CustomEmailSender_ResendCode', 'CustomEmailSender_Authentication'])('emails the code to the person for %s', async (trigger) => {
    const mailer = createMemoryMailer()

    await createCodeSender({ decrypt, mailer })(event(trigger))

    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.to).toBe(ADDRESS)
    expect(mailer.sent[0]?.text).toContain(`Your Hold code is ${CODE}.`)
  })

  // The day's email allowance counts what visitors ask Hold to send (packages/domain EMAIL_LIMITS); a person signing in
  // must never be locked out by it, so the code sender has no allowance to consult.
  it('sends every sign-in code, more in a day than any email limit allows, to the same person', async () => {
    const mailer = createMemoryMailer()
    const send = createCodeSender({ decrypt, mailer })
    const moreThanAnyLimit = Math.max(...Object.values(EMAIL_LIMITS)) + 1
    for (let sent = 0; sent < moreThanAnyLimit; sent += 1) await send(event('CustomEmailSender_Authentication'))
    expect(mailer.sent).toHaveLength(moreThanAnyLimit)
  })

  it('never logs the code or the address', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
    for (const log of logs) log.mockImplementation(() => undefined)

    await createCodeSender({ decrypt, mailer: createMemoryMailer() })(event('CustomEmailSender_Authentication'))
    const refused: Mailer = { send: () => Promise.resolve(false) }
    await expect(createCodeSender({ decrypt, mailer: refused })(event('CustomEmailSender_SignUp'))).rejects.toThrow()

    const logged = JSON.stringify(logs.map((log) => log.mock.calls))
    expect(logged).not.toContain(CODE)
    expect(logged).not.toContain(ADDRESS)
  })

  it('fails when the email could not be sent, so Cognito does not report a code that never left', async () => {
    const refused: Mailer = { send: () => Promise.resolve(false) }

    await expect(createCodeSender({ decrypt, mailer: refused })(event('CustomEmailSender_SignUp'))).rejects.toThrow(/not sent/)
  })

  it('refuses a trigger Hold does not use, and sends nothing', async () => {
    const mailer = createMemoryMailer()

    await expect(createCodeSender({ decrypt, mailer })(event('CustomEmailSender_AdminCreateUser'))).rejects.toThrow(/CustomEmailSender_AdminCreateUser/)
    expect(mailer.sent).toHaveLength(0)
  })

  it('refuses an event without a code or an address, and sends nothing', async () => {
    const mailer = createMemoryMailer()
    const send = createCodeSender({ decrypt, mailer })

    await expect(send({ triggerSource: 'CustomEmailSender_SignUp', request: { userAttributes: { email: ADDRESS } } })).rejects.toThrow()
    await expect(send({ triggerSource: 'CustomEmailSender_SignUp', request: { code: 'x', userAttributes: {} } })).rejects.toThrow()
    expect(mailer.sent).toHaveLength(0)
  })
})
