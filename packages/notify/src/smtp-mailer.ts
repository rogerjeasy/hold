import { createTransport } from 'nodemailer'
import type { Mailer } from './mailer.ts'
import { isUndeliverableAddress } from './reserved-address.ts'
import type { SmtpSettings } from './smtp-settings.ts'

type Message = { readonly from: string; readonly to: string; readonly subject: string; readonly text: string }
type Transport = { sendMail(message: Message): Promise<unknown> }

// Through an SMTP account, such as a Gmail account with an app password. The message comes from that account, which
// is the address the server lets it send as. The transport is passed in only by tests.
export function createSmtpMailer(settings: SmtpSettings, transport: Transport = smtpTransport(settings)): Mailer {
  return {
    async send(email) {
      // Done, not failed: the address can never receive mail, so a queue that retried it would retry forever.
      if (isUndeliverableAddress(email.to)) {
        console.info(JSON.stringify({ event: 'email_not_deliverable' }))
        return true
      }
      try {
        await transport.sendMail({ from: `Hold <${settings.user}>`, to: email.to, subject: email.subject, text: email.text })
        return true
      } catch (error) {
        // Logged without the address or the message. A server's refusal can quote the address, so only its kind.
        console.warn(JSON.stringify({ event: 'email_failed', error: error instanceof Error ? error.name : 'unknown' }))
        return false
      }
    },
  }
}

// Port 465 speaks TLS from the start. Any other port must upgrade to TLS before the password is sent.
function smtpTransport(settings: SmtpSettings): Transport {
  return createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: true,
    auth: { user: settings.user, pass: settings.password },
  })
}
