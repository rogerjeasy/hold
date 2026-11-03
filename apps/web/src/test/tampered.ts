// A base64url token with one byte of what it carries changed. Replacing characters at the end of the text instead
// can decode to the very same bytes, about once in 256 runs, and then a test of tampering passes the token as valid.
export function tampered(token: string): string {
  const bytes = Buffer.from(token, 'base64url')
  bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 0x01
  return bytes.toString('base64url')
}
