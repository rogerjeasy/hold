import { describe, expect, it } from 'vitest'
import { loadWorkerSettings } from './worker-settings.ts'
import { createSqsSender } from '@hold/settle'

const ENVIRONMENT = {
  AWS_REGION: 'us-east-1',
  HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold-database',
  HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/database/worker',
  HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-executions.fifo',
  HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-paypal-events.fifo',
  HOLD_UPKEEP_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-upkeep.fifo',
  HOLD_UPKEEP_QUEUE_ARN: 'arn:aws:sqs:us-east-1:1:hold-upkeep.fifo',
  HOLD_SCHEDULE_GROUP: 'hold-schedules',
  HOLD_SCHEDULER_ROLE_ARN: 'arn:aws:iam::1:role/hold-scheduler',
  HOLD_SMTP_SECRET: 'hold/email/smtp',
  HOLD_PUBLIC_URL: 'https://abc.us-east-1.awsapprunner.com',
  HOLD_RENTER_LINK_KEY_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/web/renter-link-key',
  HOLD_EVIDENCE_BUCKET: 'hold-evidence-1',
  HOLD_DISPLAY_BUCKET: 'hold-display-1',
}

describe('the worker’s settings', () => {
  it.each(['comparisons', 'media', 'evidence', 'messages'])('lets the outbox relay deliver %s work when the immediate send failed', async (queue) => {
    const settings = loadWorkerSettings({ ...ENVIRONMENT, HOLD_COMPARISONS_QUEUE_URL: 'https://sqs.test/comparisons', HOLD_MEDIA_QUEUE_URL: 'https://sqs.test/media', HOLD_EVIDENCE_QUEUE_URL: 'https://sqs.test/evidence.fifo', HOLD_MESSAGES_QUEUE_URL: 'https://sqs.test/messages' })
    let queuedUrl: string | undefined
    const send = createSqsSender({ queues: settings.queues, client: { send: (command) => { queuedUrl = command.input.QueueUrl; return Promise.resolve({}) } } })
    await send({ queue, group: 'rental', deduplicationId: 'job', body: { shopId: 'shop', comparisonId: 'comparison' } })
    expect(queuedUrl).toBe(`https://sqs.test/${queue}${queue === 'evidence' ? '.fifo' : ''}`)
  })
  it('are read from its environment, with the database name and PayPal mode defaulted', () => {
    expect(loadWorkerSettings(ENVIRONMENT)).toEqual({
      region: 'us-east-1',
      database: { clusterArn: ENVIRONMENT.HOLD_DATABASE_CLUSTER_ARN, secretArn: ENVIRONMENT.HOLD_DATABASE_SECRET_ARN, name: 'hold_db' },
      queues: { executions: ENVIRONMENT.HOLD_EXECUTIONS_QUEUE_URL, 'paypal-events': ENVIRONMENT.HOLD_PAYPAL_EVENTS_QUEUE_URL, upkeep: ENVIRONMENT.HOLD_UPKEEP_QUEUE_URL },
      schedules: { groupName: 'hold-schedules', roleArn: ENVIRONMENT.HOLD_SCHEDULER_ROLE_ARN, queueArns: { upkeep: ENVIRONMENT.HOLD_UPKEEP_QUEUE_ARN } },
      paypalMode: 'sandbox',
      smtpSecret: 'hold/email/smtp',
      publicUrl: 'https://abc.us-east-1.awsapprunner.com',
      renterLinkKeySecretArn: ENVIRONMENT.HOLD_RENTER_LINK_KEY_SECRET_ARN,
      photoBuckets: { evidence: 'hold-evidence-1', display: 'hold-display-1' },
    })
  })

  it('name what is missing, without any value', () => {
    expect(() => loadWorkerSettings({ ...ENVIRONMENT, HOLD_DATABASE_SECRET_ARN: undefined })).toThrow(/HOLD_DATABASE_SECRET_ARN/)
  })
})
