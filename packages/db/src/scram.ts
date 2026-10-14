import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

// PostgreSQL's SCRAM-SHA-256 verifier for a password (RFC 7677), the form it stores. Handing PostgreSQL the verifier
// instead of the password keeps the password out of the statement, and so out of any log of it.
const ITERATIONS = 4096
const KEY_LENGTH = 32

function hmac(key: Buffer, text: string): Buffer {
  return createHmac('sha256', key).update(text).digest()
}

export function scramVerifier(password: string, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, ITERATIONS, KEY_LENGTH, 'sha256')
  const storedKey = createHash('sha256').update(hmac(salted, 'Client Key')).digest()
  const serverKey = hmac(salted, 'Server Key')
  return `SCRAM-SHA-256$${String(ITERATIONS)}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}
