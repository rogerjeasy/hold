import { expect, it } from 'vitest'
import { loadOperationsSettings } from './operations-settings.ts'

const ENVIRONMENT = {
  AWS_REGION: 'us-east-1',
  HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold-database',
  HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/database/worker',
  HOLD_OPS_AGENT_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/hold-ops-agent.fifo',
  HOLD_SMTP_SECRET: 'hold/email/smtp',
  HOLD_EVIDENCE_BUCKET: 'hold-evidence-707938860881',
}

it('reads only what the operations agent needs, with the database name, PayPal mode and MCP address defaulted', () => {
  expect(loadOperationsSettings(ENVIRONMENT)).toEqual({
    region: 'us-east-1',
    database: { clusterArn: ENVIRONMENT.HOLD_DATABASE_CLUSTER_ARN, secretArn: ENVIRONMENT.HOLD_DATABASE_SECRET_ARN, name: 'hold_db' },
    opsAgentQueueUrl: ENVIRONMENT.HOLD_OPS_AGENT_QUEUE_URL,
    smtpSecret: 'hold/email/smtp',
    paypalMode: 'sandbox',
    paypalMcpUrl: 'https://mcp.sandbox.paypal.com/sse',
    // Where the evidence packs a dispute answer attaches are kept.
    evidenceBucket: 'hold-evidence-707938860881',
  })
})

it('names what is missing without its value', () => {
  expect(() => loadOperationsSettings({ ...ENVIRONMENT, HOLD_DATABASE_SECRET_ARN: 'secret' })).toThrow(/HOLD_DATABASE_SECRET_ARN/)
})
