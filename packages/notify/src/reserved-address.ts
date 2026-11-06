// Domains no mail can ever reach (RFC 2606 and RFC 6761): the demo's accounts on demo.hold.example and its sample
// renters on renter.invalid live there on purpose. Sending to one only earns a bounce in the sending account's inbox.
const RESERVED_TOP_LEVEL = ['example', 'invalid', 'test', 'localhost']
const RESERVED_SECOND_LEVEL = ['example.com', 'example.net', 'example.org']

export function isUndeliverableAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase().replace(/\.$/, '')
  const labels = domain.split('.')
  const topLevel = labels.at(-1) ?? ''
  return RESERVED_TOP_LEVEL.includes(topLevel) || RESERVED_SECOND_LEVEL.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`))
}
