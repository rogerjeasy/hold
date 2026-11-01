import { money } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { promiseMissedRenterText } from './claim-promise-emails.ts'
import { holdReplacementText } from './hold-emails.ts'
import { reminderText } from './reminder-email.ts'
import { settlementReceiptText } from './settlement-email.ts'
import { shopMessageText } from './shop-message-email.ts'

// The texts the worker sends a renter who chose them (architecture.md section 12.3): what each email says, short enough
// for a phone, in the renter's language, always naming the shop first so the renter knows who wrote.

describe('the texts a renter gets from the worker', () => {
  it('say the reminder with its due time, in the renter’s language', () => {
    expect(reminderText('en', 'return_due', { shopName: 'Ribeira Bikes', dueOn: '20 Oct, 18:00' })).toBe('Ribeira Bikes: your rental was due back on 20 Oct, 18:00. Please bring it back, or contact the shop if you need more time.')
    expect(reminderText('fr', 'reply_due', { shopName: 'Ribeira Bikes', dueOn: '20 oct., 18:00' })).toMatch(/^Ribeira Bikes : .*20 oct\., 18:00/)
    expect(reminderText('xx', 'invoice', { shopName: 'Ribeira Bikes', dueOn: null })).toMatch(/^Ribeira Bikes: /)
  })

  it('ask for a new hold with its amount, its end and the link to approve it, saying it is not a charge', () => {
    const text = holdReplacementText('de', { shopName: 'Ribeira Bikes', amount: money(300_00, 'EUR'), approveUrl: 'https://hold.test/de/r/T/pay', endsOn: '3. Nov.' })
    expect(text).toContain('300,00')
    expect(text).toContain('3. Nov.')
    expect(text).toContain('https://hold.test/de/r/T/pay')
    expect(text).toContain('keine Belastung')
  })

  it('say a missed promise either waived the claim or left it to the owner', () => {
    expect(promiseMissedRenterText('en', { shopName: 'Ribeira Bikes', waived: true })).toContain('nothing is charged')
    expect(promiseMissedRenterText('en', { shopName: 'Ribeira Bikes', waived: false })).toContain('The owner must decide it now')
  })

  it('confirm what PayPal moved, with the link to the record', () => {
    const text = settlementReceiptText('es', { shopName: 'Ribeira Bikes', kind: 'capture', amount: money(35_00, 'EUR'), simulated: true, recordUrl: 'https://hold.test/es/r/T/record?version=1' })
    expect(text).toMatch(/^\[Demostración simulada\] Ribeira Bikes: Pago recibido: 35,00/)
    expect(text).toContain('https://hold.test/es/r/T/record?version=1')
  })

  it('carry a message the shop approved as written, after the shop’s name', () => {
    expect(shopMessageText({ shopName: 'Ribeira Bikes', text: 'Your helmet is at the counter.' })).toBe('Ribeira Bikes: Your helmet is at the counter.')
  })
})
