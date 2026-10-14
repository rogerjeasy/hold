// The browser's half of a passkey: WebAuthn's own JSON in, WebAuthn's own JSON out. The server and the identity
// service do everything else.

export function passkeysSupported(): boolean {
  return typeof PublicKeyCredential !== 'undefined' && 'parseRequestOptionsFromJSON' in PublicKeyCredential
}

export async function askForPasskey(requestOptionsJson: string): Promise<string | undefined> {
  const options = PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(requestOptionsJson) as PublicKeyCredentialRequestOptionsJSON)
  const credential = await navigator.credentials.get({ publicKey: options })
  return credential instanceof PublicKeyCredential ? JSON.stringify(credential.toJSON()) : undefined
}

export async function makePasskey(creationOptionsJson: string): Promise<string | undefined> {
  const options = PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(creationOptionsJson) as PublicKeyCredentialCreationOptionsJSON)
  const credential = await navigator.credentials.create({ publicKey: options })
  return credential instanceof PublicKeyCredential ? JSON.stringify(credential.toJSON()) : undefined
}
