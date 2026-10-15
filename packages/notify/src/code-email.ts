import type { Email } from './mailer.ts'

// The one-time code Cognito made for signing up or signing in, as the person receives it.
export function codeEmail(to: string, code: string): Email {
  return {
    to,
    subject: 'Your Hold code',
    text: `Your Hold code is ${code}. Enter it on the page that asked for it. If you did not ask for it, you can ignore this email.`,
  }
}
