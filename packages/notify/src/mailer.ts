import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'

// Email Hold sends itself, such as a staff invitation. Sign-in codes are sent by Cognito, not through this.
export type Email = {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export type Mailer = {
  // False when the message could not be sent. The caller decides what the person is told.
  send(email: Email): Promise<boolean>
}

export type SesSettings = { readonly region: string; readonly from: string }

// Through Amazon SES, from the identity Cognito already uses. In the SES sandbox only verified addresses receive it.
// The client is passed in only by tests.
export function createSesMailer(settings: SesSettings, client: Pick<SESv2Client, 'send'> = new SESv2Client({ region: settings.region })): Mailer {
  return {
    async send(email) {
      try {
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: `Hold <${settings.from}>`,
            Destination: { ToAddresses: [email.to] },
            Content: { Simple: { Subject: { Data: email.subject, Charset: 'UTF-8' }, Body: { Text: { Data: email.text, Charset: 'UTF-8' } } } },
          }),
        )
        return true
      } catch (error) {
        // Logged without the address or the message.
        console.warn(JSON.stringify({ event: 'email_failed', error: error instanceof Error ? error.name : 'unknown' }))
        return false
      }
    },
  }
}

export function createMemoryMailer(): Mailer & { readonly sent: readonly Email[] } {
  const sent: Email[] = []
  return {
    sent,
    send(email) {
      sent.push(email)
      return Promise.resolve(true)
    },
  }
}
