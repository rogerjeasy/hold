import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  DeleteWebAuthnCredentialCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { AttributeType } from '@aws-sdk/client-cognito-identity-provider'
import type { AccountType } from '../identity.ts'
import type { CognitoSettings } from './cognito-identity.ts'

// What the demo reset does to the demo accounts in Cognito (architecture.md section 20.3), run by an administrator
// with the account's own credentials, never by the app. Each account is made if missing, given its password, and
// cleared of what judges left: their passkeys and their sessions. A failure throws: the reset stops and says so.

export type DemoAccount = { readonly email: string; readonly password: string; readonly group: AccountType }
export type PreparedDemoAccount = { readonly subject: string; readonly passkeysRemoved: number }

function subjectOf(attributes: readonly AttributeType[] | undefined): string {
  const subject = attributes?.find((attribute) => attribute.Name === 'sub')?.Value
  if (subject === undefined) throw new Error('Cognito returned the demo account without its subject.')
  return subject
}

export function createDemoAccountAdmin(
  settings: CognitoSettings,
  client: Pick<CognitoIdentityProviderClient, 'send'> = new CognitoIdentityProviderClient({ region: settings.region }),
) {
  const { userPoolId: UserPoolId, clientId: ClientId } = settings

  async function existingSubject(email: string): Promise<string | undefined> {
    try {
      return subjectOf((await client.send(new AdminGetUserCommand({ UserPoolId, Username: email }))).UserAttributes)
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException') return undefined
      throw error
    }
  }

  // A passkey can only be removed with the account's own access token, so the reset signs in as the account first.
  async function removePasskeys(account: DemoAccount): Promise<number> {
    const signedIn = await client.send(
      new InitiateAuthCommand({ ClientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: account.email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: account.password } }),
    )
    const AccessToken = signedIn.AuthenticationResult?.AccessToken
    if (AccessToken === undefined) throw new Error(`Cognito did not sign the demo account in with its password (${String(signedIn.ChallengeName)}).`)
    const listed = await client.send(new ListWebAuthnCredentialsCommand({ AccessToken }))
    const ids = (listed.Credentials ?? []).flatMap((credential) => (credential.CredentialId === undefined ? [] : [credential.CredentialId]))
    for (const CredentialId of ids) await client.send(new DeleteWebAuthnCredentialCommand({ AccessToken, CredentialId }))
    return ids.length
  }

  return {
    async prepare(account: DemoAccount): Promise<PreparedDemoAccount> {
      const Username = account.email
      const subject =
        (await existingSubject(Username)) ??
        subjectOf(
          (
            await client.send(
              new AdminCreateUserCommand({
                UserPoolId,
                Username,
                MessageAction: 'SUPPRESS',
                UserAttributes: [
                  { Name: 'email', Value: Username },
                  { Name: 'email_verified', Value: 'true' },
                ],
              }),
            )
          ).User?.Attributes,
        )
      await client.send(new AdminSetUserPasswordCommand({ UserPoolId, Username, Password: account.password, Permanent: true }))
      await client.send(new AdminAddUserToGroupCommand({ UserPoolId, Username, GroupName: account.group }))
      const passkeysRemoved = await removePasskeys(account)
      // Ends every session a judge still holds, so the next judge starts from the same place.
      await client.send(new AdminUserGlobalSignOutCommand({ UserPoolId, Username }))
      return { subject, passkeysRemoved }
    },
  }
}
