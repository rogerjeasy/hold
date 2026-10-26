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
  it('hands frozen record builds directly to the evidence queue when configured', () => {
    expect(loadWebConfig({ ...AWS, HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.test/e.fifo', HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.test/p.fifo', HOLD_EVIDENCE_QUEUE_URL: 'https://sqs.test/evidence.fifo' })).toMatchObject({ queues: { evidence: 'https://sqs.test/evidence.fifo' } })
  })
  it('hands return comparisons directly to their queue when configured', () => {
    expect(loadWebConfig({ ...AWS, HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.test/e.fifo', HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.test/p.fifo', HOLD_COMPARISONS_QUEUE_URL: 'https://sqs.test/comparisons' })).toMatchObject({ queues: { comparisons: 'https://sqs.test/comparisons' } })
  })
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

  it('sends work to the worker’s queues when it knows them, and must know them when deployed', () => {
    const queues = { HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-executions.fifo', HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-paypal-events.fifo', HOLD_MEDIA_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-media' }
    expect(loadWebConfig({ ...AWS, ...queues })).toMatchObject({ queues: { executions: queues.HOLD_EXECUTIONS_QUEUE_URL, 'paypal-events': queues.HOLD_PAYPAL_EVENTS_QUEUE_URL, media: queues.HOLD_MEDIA_QUEUE_URL } })
    expect(loadWebConfig(AWS)).toMatchObject({ queues: undefined })
    expect(() => loadWebConfig({ ...AWS, HOLD_ENVIRONMENT: 'production' })).toThrow(/HOLD_EXECUTIONS_QUEUE_URL/)
  })

  it('takes the cookie key itself on a developer’s machine, and never when deployed', () => {
    const local = { ...AWS, HOLD_COOKIE_KEY_SECRET_ARN: undefined, HOLD_COOKIE_KEY: KEY }
    expect(loadWebConfig(local).cookieKey).toMatchObject({ kind: 'value' })
    expect(() => loadWebConfig({ ...local, HOLD_ENVIRONMENT: 'production' })).toThrow(/HOLD_COOKIE_KEY/)
  })

  it('names the renter key’s secret and the credential signing key in KMS, and needs both when deployed', () => {
    const trustSecret = 'arn:aws:secretsmanager:us-east-1:1:secret:hold/web/trust-key'
    expect(loadWebConfig({ ...AWS, HOLD_TRUST_KEY_SECRET_ARN: trustSecret, HOLD_CREDENTIAL_KEY_ID: 'alias/hold-credential-key' })).toMatchObject({
      trustKey: { kind: 'secret', secretArn: trustSecret },
      credentialKey: { kind: 'kms', keyId: 'alias/hold-credential-key' },
    })
    const deployed = { ...AWS, HOLD_ENVIRONMENT: 'production', HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.test/e.fifo', HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.test/p.fifo', HOLD_EVIDENCE_BUCKET: 'evidence', HOLD_DISPLAY_BUCKET: 'display', HOLD_RENTER_LINK_KEY_SECRET_ARN: SECRET }
    expect(() => loadWebConfig(deployed)).toThrow(/HOLD_TRUST_KEY_SECRET_ARN, HOLD_CREDENTIAL_KEY_ID/)
    expect(() => loadWebConfig({ ...deployed, HOLD_TRUST_KEY_SECRET_ARN: trustSecret, HOLD_CREDENTIAL_KEY_ID: 'alias/hold-credential-key', HOLD_TRUST_KEY: KEY })).toThrow(/HOLD_TRUST_KEY/)
    expect(loadWebConfig({ ...deployed, HOLD_TRUST_KEY_SECRET_ARN: trustSecret, HOLD_CREDENTIAL_KEY_ID: 'alias/hold-credential-key' })).toMatchObject({ environment: 'production' })
  })

  it('signs credentials with a key in this process on a developer’s machine, and makes the renter key from the cookie key unless told otherwise', () => {
    expect(loadWebConfig(AWS)).toMatchObject({ trustKey: { kind: 'secret', secretArn: SECRET }, credentialKey: { kind: 'local' } })
    expect(loadWebConfig({ ...AWS, HOLD_TRUST_KEY: KEY }).trustKey).toMatchObject({ kind: 'value' })
    expect(loadWebConfig({ HOLD_ENVIRONMENT: 'test', HOLD_COOKIE_KEY: KEY })).toMatchObject({ trustKey: { kind: 'value' }, credentialKey: { kind: 'local' } })
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

  it('signs renter links with a key of their own, read from its secret, which the worker reads too', () => {
    const LINK_SECRET = 'arn:aws:secretsmanager:us-east-1:1:secret:hold/web/renter-link-key'
    expect(loadWebConfig({ ...AWS, HOLD_RENTER_LINK_KEY_SECRET_ARN: LINK_SECRET }).renterLinkKey).toEqual({ kind: 'secret', secretArn: LINK_SECRET })
    expect(loadWebConfig({ ...AWS, HOLD_RENTER_LINK_KEY: KEY }).renterLinkKey).toMatchObject({ kind: 'value' })
  })

  it('falls back to the cookie key for renter links only on a developer’s machine', () => {
    expect(loadWebConfig(AWS).renterLinkKey).toEqual({ kind: 'secret', secretArn: SECRET })
    expect(() => loadWebConfig({ ...AWS, HOLD_ENVIRONMENT: 'production', HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.test/e.fifo', HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.test/p.fifo' })).toThrow(/HOLD_RENTER_LINK_KEY_SECRET_ARN/)
    expect(() => loadWebConfig({ ...AWS, HOLD_ENVIRONMENT: 'production', HOLD_RENTER_LINK_KEY: KEY })).toThrow(/HOLD_RENTER_LINK_KEY/)
  })

  it('names the two photograph buckets, which a deployed app must know', () => {
    const buckets = { HOLD_EVIDENCE_BUCKET: 'hold-evidence-1', HOLD_DISPLAY_BUCKET: 'hold-display-1' }
    expect(loadWebConfig({ ...AWS, ...buckets })).toMatchObject({ photoBuckets: { evidence: 'hold-evidence-1', display: 'hold-display-1' } })
    expect(loadWebConfig(AWS)).toMatchObject({ photoBuckets: undefined })
    expect(() => loadWebConfig({ ...AWS, HOLD_ENVIRONMENT: 'production' })).toThrow(/HOLD_EVIDENCE_BUCKET/)
  })
})

