import { describe, expect, it } from 'vitest'
import { loadWorkerSettings } from './worker-settings.ts'

const ENVIRONMENT = {
  AWS_REGION: 'us-east-1',
  HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold-database',
  HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/database/worker',
  HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-executions.fifo',
  HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-paypal-events.fifo',
}

describe('the worker’s settings', () => {
  it('are read from its environment, with the database name and PayPal mode defaulted', () => {
    expect(loadWorkerSettings(ENVIRONMENT)).toEqual({
      region: 'us-east-1',
      database: { clusterArn: ENVIRONMENT.HOLD_DATABASE_CLUSTER_ARN, secretArn: ENVIRONMENT.HOLD_DATABASE_SECRET_ARN, name: 'hold_db' },
      queues: { executions: ENVIRONMENT.HOLD_EXECUTIONS_QUEUE_URL, 'paypal-events': ENVIRONMENT.HOLD_PAYPAL_EVENTS_QUEUE_URL },
      paypalMode: 'sandbox',
    })
  })

  it('name what is missing, without any value', () => {
    expect(() => loadWorkerSettings({ ...ENVIRONMENT, HOLD_DATABASE_SECRET_ARN: undefined })).toThrow(/HOLD_DATABASE_SECRET_ARN/)
  })
})
