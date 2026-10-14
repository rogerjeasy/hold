import { describe, expect, it } from 'vitest'
import { scramVerifier } from './scram.ts'

describe('scramVerifier', () => {
  it('matches a verifier computed independently, with Python’s hashlib', () => {
    expect(scramVerifier('correct horse battery staple', Buffer.from([...Array(16).keys()]))).toBe(
      'SCRAM-SHA-256$4096:AAECAwQFBgcICQoLDA0ODw==$ONYbSJBXtKl6bP6PVqw8pm9e7EiacprLnoUQPFS80Hw=:IPOtHuGJ2HifEQg74W2XXqqCrCyQG55GbPRHa6g6n9w=',
    )
  })

  it('uses a fresh salt each time', () => {
    expect(scramVerifier('same password')).not.toBe(scramVerifier('same password'))
  })
})
