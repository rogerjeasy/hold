import type { SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2'
import { describe, expect, it, vi } from 'vitest'
import { workerTexter } from './worker-texter.ts'

const text = { to: '+41791234567', body: 'Ribeira Bikes: hello', context: { shopId: 'shop-1', rentalId: 'rental-1' } }

describe('the worker’s texts', () => {
  it('go from the sender and through the configuration set its settings name', async () => {
    const send = vi.fn<(command: SendTextMessageCommand) => Promise<{ MessageId: string }>>(() => Promise.resolve({ MessageId: 'aws-1' }))
    await workerTexter({ AWS_REGION: 'us-east-1', HOLD_TEXT_SENDER: 'RIBEIRA', HOLD_TEXT_CONFIGURATION_SET: 'hold-texts' }, { send }).send(text)
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ OriginationIdentity: 'RIBEIRA', ConfigurationSetName: 'hold-texts' })
  })

  it('leave both to AWS when unset, and refuse an empty one', async () => {
    const send = vi.fn<(command: SendTextMessageCommand) => Promise<{ MessageId: string }>>(() => Promise.resolve({ MessageId: 'aws-2' }))
    await workerTexter({ AWS_REGION: 'us-east-1' }, { send }).send(text)
    expect(send.mock.calls[0]?.[0].input).not.toHaveProperty('OriginationIdentity')
    expect(() => workerTexter({ AWS_REGION: 'us-east-1', HOLD_TEXT_SENDER: '' })).toThrow(/HOLD_TEXT_SENDER/)
  })
})
