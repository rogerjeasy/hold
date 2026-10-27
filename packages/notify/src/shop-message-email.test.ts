import { expect, it } from 'vitest'
import { shopMessageEmail } from './shop-message-email.ts'

it('carries the shop\'s approved words as they are, from the shop, in the renter\'s language', () => {
  const email = shopMessageEmail('priya@example.com', 'es', { shopName: 'Ribeira Bikes', text: 'Please call the shop about your hold.' })
  expect(email).toMatchObject({ to: 'priya@example.com', subject: 'Un mensaje de Ribeira Bikes sobre tu alquiler' })
  expect(email.text).toContain('Please call the shop about your hold.')
  expect(shopMessageEmail('a@b.example', 'pt', { shopName: 'Ribeira Bikes', text: 'x' }).subject).toBe('A message from Ribeira Bikes about your rental')
})
