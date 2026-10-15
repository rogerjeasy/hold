import type { Mailer } from './mailer.ts'

// A mailer made when the first message is sent, such as one whose login is read from Secrets Manager. If it cannot
// be made, that message is reported as unsent and the next one tries again, so email failing never stops anything else.
export function createLazyMailer(make: () => Promise<Mailer>): Mailer {
  let made: Promise<Mailer> | undefined
  return {
    async send(email) {
      made ??= make()
      try {
        return await (await made).send(email)
      } catch (error) {
        made = undefined
        console.warn(JSON.stringify({ event: 'mailer_unavailable', error: error instanceof Error ? error.name : 'unknown' }))
        return false
      }
    },
  }
}
