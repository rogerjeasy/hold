// How a renter is reached, as their own pages show it (architecture.md section 12.3): the channel, the number masked,
// whether they confirmed it, whether a new number now needs a code from the channel trusted, and the texts a demo shop
// showed here instead of sending.
export type RenterContactView = {
  readonly channel: 'email' | 'text'
  readonly phone: string | null
  readonly confirmed: boolean
  readonly locked: boolean
  readonly shown: readonly { readonly id: string; readonly body: string }[]
}
