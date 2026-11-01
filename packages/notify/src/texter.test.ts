import { ConflictException, SendTextMessageCommand, ValidationException } from '@aws-sdk/client-pinpoint-sms-voice-v2'
import { describe, expect, it, vi } from 'vitest'
import { createAwsTexter, createMemoryTexter } from './texter.ts'

const text = { to: '+41791234567', body: 'Ribeira Bikes: your link https://hold.example/r/T', context: { shopId: 'shop-1', rentalId: 'rental-1' } }

describe('texts through AWS End User Messaging', () => {
  it('sends a transactional text with the shop and rental as context, so its delivery report finds its way back', async () => {
    const send = vi.fn<(command: SendTextMessageCommand) => Promise<{ MessageId: string }>>(() => Promise.resolve({ MessageId: 'aws-message-1' }))
    const texter = createAwsTexter({ region: 'us-east-1', configurationSet: 'hold-texts', originationIdentity: 'RIBEIRA', client: { send } })
    expect(await texter.send(text)).toEqual({ ok: true, messageId: 'aws-message-1' })
    expect(send.mock.calls[0]?.[0].input).toEqual({
      DestinationPhoneNumber: '+41791234567',
      MessageBody: text.body,
      MessageType: 'TRANSACTIONAL',
      ConfigurationSetName: 'hold-texts',
      OriginationIdentity: 'RIBEIRA',
      Context: { shopId: 'shop-1', rentalId: 'rental-1' },
    })
  })

  it('leaves the sender and the configuration set to AWS when none is set', async () => {
    const send = vi.fn<(command: SendTextMessageCommand) => Promise<{ MessageId: string }>>(() => Promise.resolve({ MessageId: 'aws-message-2' }))
    await createAwsTexter({ region: 'us-east-1', client: { send } }).send(text)
    expect(send.mock.calls[0]?.[0].input).not.toHaveProperty('OriginationIdentity')
    expect(send.mock.calls[0]?.[0].input).not.toHaveProperty('ConfigurationSetName')
  })

  it('says a number opted out by replying STOP, so Hold uses email instead', async () => {
    const send = vi.fn(() => Promise.reject(new ConflictException({ message: 'opted out', Reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT', $metadata: {} })))
    expect(await createAwsTexter({ region: 'us-east-1', client: { send } }).send(text)).toEqual({ ok: false, reason: 'opted_out' })
  })

  it('reports any other refusal as unsent, logging only its kind, never the number or the words', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const send = vi.fn(() => Promise.reject(new ValidationException({ message: 'Destination +41791234567 is not verified', Reason: 'DESTINATION_COUNTRY_BLOCKED', $metadata: {} })))
    expect(await createAwsTexter({ region: 'us-east-1', client: { send } }).send(text)).toEqual({ ok: false, reason: 'unavailable' })
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('ValidationException')
    expect(logged).not.toContain('+41791234567')
    expect(logged).not.toContain('Ribeira')
    warn.mockRestore()
  })
})

describe('texts kept in memory', () => {
  it('records each text for a test to read', async () => {
    const texter = createMemoryTexter()
    expect(await texter.send(text)).toEqual({ ok: true, messageId: 'memory-1' })
    expect(texter.sent).toEqual([text])
  })
})
