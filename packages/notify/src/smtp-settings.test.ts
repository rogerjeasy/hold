import { describe, expect, it } from 'vitest'
import { loadSmtpSettings } from './smtp-settings.ts'

const secretHolding = (value: string | undefined) => ({ send: () => Promise.resolve({ SecretString: value }) })

describe('the SMTP login kept in Secrets Manager', () => {
  it('reads the server, port, account and password', async () => {
    const secret = JSON.stringify({ host: 'smtp.example.test', port: 587, user: 'hold@example.test', password: 'app-password' })

    expect(await loadSmtpSettings('hold/email/smtp', 'us-east-1', secretHolding(secret))).toEqual({
      host: 'smtp.example.test',
      port: 587,
      user: 'hold@example.test',
      password: 'app-password',
    })
  })

  it('refuses a login with a part missing, naming the part and none of the values', async () => {
    const secret = JSON.stringify({ host: 'smtp.example.test', port: 587, user: 'hold@example.test' })

    const loading = loadSmtpSettings('hold/email/smtp', 'us-east-1', secretHolding(secret))

    await expect(loading).rejects.toThrow(/password/)
    await expect(loading).rejects.not.toThrow(/hold@example\.test|smtp\.example\.test/)
  })

  it('refuses an empty secret', async () => {
    await expect(loadSmtpSettings('hold/email/smtp', 'us-east-1', secretHolding(undefined))).rejects.toThrow(/empty/)
  })
})
