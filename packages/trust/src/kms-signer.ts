import { createPublicKey } from 'node:crypto'
import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms'
import { publicJwk } from './signer.ts'
import type { CredentialSigner } from './signer.ts'

// Credentials signed by an asymmetric key in AWS KMS (ECC_NIST_P256, SIGN_VERIFY). The private key never leaves KMS;
// the app may only sign with it and read its public key. An administrator makes the key (infra/lib/settings.ts).

export type KmsCalls = {
  sign(command: SignCommand): Promise<{ readonly Signature?: Uint8Array | undefined }>
  publicKey(command: GetPublicKeyCommand): Promise<{ readonly PublicKey?: Uint8Array | undefined; readonly KeySpec?: string | undefined; readonly KeyUsage?: string | undefined }>
}

export function kmsCalls(region: string): KmsCalls {
  const client = new KMSClient({ region })
  return { sign: (command) => client.send(command), publicKey: (command) => client.send(command) }
}

// KMS returns an ECDSA signature DER-encoded; JWS writes r and s as 32 bytes each.
function joseSignature(der: Uint8Array): Uint8Array {
  const bytes = Buffer.from(der)
  let offset = 2
  if (bytes[0] !== 0x30) throw new Error('KMS returned a signature that is not DER.')
  if ((bytes[1] ?? 0) & 0x80) offset = 2 + ((bytes[1] ?? 0) & 0x7f)
  const integer = () => {
    if (bytes[offset] !== 0x02) throw new Error('KMS returned a signature that is not DER.')
    const length = bytes[offset + 1] ?? 0
    const value = bytes.subarray(offset + 2, offset + 2 + length)
    offset += 2 + length
    const trimmed = value.subarray(Math.max(0, value.length - 32))
    return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed])
  }
  return new Uint8Array(Buffer.concat([integer(), integer()]))
}

// Reads the public key once, at start, so a key of the wrong kind is found before the first credential.
export async function createKmsSigner(options: { readonly keyId: string; readonly kms: KmsCalls }): Promise<CredentialSigner> {
  const read = await options.kms.publicKey(new GetPublicKeyCommand({ KeyId: options.keyId }))
  if (read.PublicKey === undefined || read.KeySpec !== 'ECC_NIST_P256' || read.KeyUsage !== 'SIGN_VERIFY') throw new Error('The credential key in KMS is not a P-256 signing key.')
  const jwk = publicJwk(createPublicKey({ key: Buffer.from(read.PublicKey), format: 'der', type: 'spki' }).export({ format: 'jwk' }))
  return {
    keyId: jwk.kid,
    async sign(data) {
      const signed = await options.kms.sign(new SignCommand({ KeyId: options.keyId, Message: data, MessageType: 'RAW', SigningAlgorithm: 'ECDSA_SHA_256' }))
      if (signed.Signature === undefined) throw new Error('KMS returned no signature.')
      return joseSignature(signed.Signature)
    },
    publicKey: () => Promise.resolve(jwk),
  }
}
