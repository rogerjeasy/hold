import { describe, expect, it } from 'vitest'
import { loadWebConfig } from './web-config.ts'

const KEY = Buffer.alloc(32, 7).toString('base64')
const SECRET = 'arn:aws:secretsmanager:us-east-1:1:secret:hold/web/cookie-key'
const AWS = {
  HOLD_COGNITO_USER_POOL_ID: 'us-east-1_2kEqBx3YP',
  HOLD_COGNITO_CLIENT_ID: 'client',
  HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold-database',
  HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/database/app',
  HOLD_COOKIE_KEY_SECRET_ARN: SECRET,
  HOLD_SMTP_SECRET: 'hold/email/smtp',
}

describe('loadWebConfig', () => {
  it('reads the AWS services, with defaults for the region, database name and public address', () => {
    expect(loadWebConfig(AWS)).toMatchObject({
      environment: 'development',
      services: 'aws',
      region: 'us-east-1',
      cognito: { userPoolId: 'us-east-1_2kEqBx3YP', clientId: 'client' },
      database: { name: 'hold_db' },
      cookieKey: { kind: 'secret', secretArn: SECRET },
      smtpSecret: 'hold/email/smtp',
      publicUrl: 'http://localhost:3210',
      paypalMode: 'sandbox',
    })
  })

  it('takes the cookie key itself on a developer’s machine, and never when deployed', () => {
    const local = { ...AWS, HOLD_COOKIE_KEY_SECRET_ARN: undefined, HOLD_COOKIE_KEY: KEY }
    expect(loadWebConfig(local).cookieKey).toMatchObject({ kind: 'value' })
    expect(() => loadWebConfig({ ...local, HOLD_ENVIRONMENT: 'production' })).toThrow(/HOLD_COOKIE_KEY/)
  })

  it('names the missing settings without showing any value', () => {
    expect(() => loadWebConfig({ ...AWS, HOLD_COGNITO_CLIENT_ID: undefined, HOLD_SMTP_SECRET: '' })).toThrow(/HOLD_COGNITO_CLIENT_ID, HOLD_SMTP_SECRET/)
    expect(() => loadWebConfig({ ...AWS, HOLD_DATABASE_CLUSTER_ARN: 'not-an-arn' })).not.toThrow(/not-an-arn/)
  })

  it('needs one way to the cookie key', () => {
    expect(() => loadWebConfig({ ...AWS, HOLD_COOKIE_KEY_SECRET_ARN: undefined })).toThrow(/HOLD_COOKIE_KEY_SECRET_ARN/)
  })

  it('uses the fakes only when the environment says test', () => {
    expect(loadWebConfig({ HOLD_ENVIRONMENT: 'test', HOLD_COOKIE_KEY: KEY })).toMatchObject({ services: 'fake' })
    expect(() => loadWebConfig({ HOLD_ENVIRONMENT: 'production', HOLD_COOKIE_KEY: KEY })).toThrow(/HOLD_COGNITO_USER_POOL_ID/)
  })
})
