import { ConflictException, PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2'

// Text messages Hold sends a renter who chose them (architecture.md section 12.3), through AWS End User Messaging, so
// everything stays inside the AWS account. The context goes with the text and comes back in its delivery report.
export type Text = {
  readonly to: string
  readonly body: string
  readonly context: { readonly shopId: string; readonly rentalId: string }
}

// Opted out: the number replied STOP and AWS keeps it on the account's opt-out list. The caller decides what the renter
// is told and uses email instead.
export type TextResult = { readonly ok: true; readonly messageId: string | null } | { readonly ok: false; readonly reason: 'opted_out' | 'unavailable' }

export type Texter = { send(text: Text): Promise<TextResult> }

export function createMemoryTexter(): Texter & { readonly sent: readonly Text[] } {
  const sent: Text[] = []
  return {
    sent,
    send(text) {
      sent.push(text)
      return Promise.resolve({ ok: true, messageId: `memory-${String(sent.length)}` })
    },
  }
}

type Client = { send: (command: SendTextMessageCommand) => Promise<{ readonly MessageId?: string }> }

// The sender (a registered number or a sender name such as the shop's) and the configuration set that carries delivery
// reports are the account's settings; without them AWS chooses its own sender and reports nothing back.
export function createAwsTexter(options: { readonly region: string; readonly configurationSet?: string; readonly originationIdentity?: string; readonly client?: Client }): Texter {
  const client: Client = options.client ?? new PinpointSMSVoiceV2Client({ region: options.region })
  return {
    async send(text) {
      try {
        const reply = await client.send(new SendTextMessageCommand({
          DestinationPhoneNumber: text.to,
          MessageBody: text.body,
          MessageType: 'TRANSACTIONAL',
          ...(options.configurationSet === undefined ? {} : { ConfigurationSetName: options.configurationSet }),
          ...(options.originationIdentity === undefined ? {} : { OriginationIdentity: options.originationIdentity }),
          Context: { shopId: text.context.shopId, rentalId: text.context.rentalId },
        }))
        return { ok: true, messageId: reply.MessageId ?? null }
      } catch (error) {
        if (error instanceof ConflictException && error.Reason === 'DESTINATION_PHONE_NUMBER_OPTED_OUT') return { ok: false, reason: 'opted_out' }
        // A refusal can quote the number, so only its kind is logged.
        console.warn(JSON.stringify({ event: 'text_failed', error: error instanceof Error ? error.name : 'unknown' }))
        return { ok: false, reason: 'unavailable' }
      }
    },
  }
}
