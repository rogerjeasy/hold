// Email Hold sends: its own, such as a staff invitation, and the sign-in codes Cognito hands to the code sender.
export type Email = {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export type Mailer = {
  // False when the message could not be sent. The caller decides what the person is told.
  send(email: Email): Promise<boolean>
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
