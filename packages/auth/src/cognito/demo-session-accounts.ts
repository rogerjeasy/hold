import { AdminAddUserToGroupCommand, AdminCreateUserCommand, CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider'
import type { AttributeType, InitiateAuthCommandOutput } from '@aws-sdk/client-cognito-identity-provider'
import { DEMO_SESSION_DOMAIN, isDemoSessionAddress, newDemoPassword } from '../demo-accounts.ts'
import type { AccountType } from '../identity.ts'
import type { CognitoSettings } from './cognito-identity.ts'

// The two accounts of one demo session (architecture.md section 20.3), made by the web app when a judge starts a demo.
// The app may only create a user and add it to a group: it is never allowed to set a password with administrator
// rights, so it cannot change an existing person's. The account is made with a temporary password, and its own first
// sign-in sets the real one. Addresses are on the demo's own domain, which receives no mail.

export type DemoAccount = { readonly email: string; readonly password: string; readonly group: AccountType }
export type DemoSessionAccounts = { readonly create: (account: DemoAccount) => Promise<string> }

function subjectOf(attributes: readonly AttributeType[] | undefined): string {
  const subject = attributes?.find((attribute) => attribute.Name === 'sub')?.Value
  if (subject === undefined) throw new Error('Cognito returned the demo account without its subject.')
  return subject
}

export function createDemoSessionAccounts(
  settings: CognitoSettings,
  client: Pick<CognitoIdentityProviderClient, 'send'> = new CognitoIdentityProviderClient({ region: settings.region }),
): DemoSessionAccounts {
  const { userPoolId: UserPoolId, clientId: ClientId } = settings

  // Signs in with the temporary password, answering which way to sign in if Cognito asks, and stops at the request for
  // a new one.
  async function newPasswordSession(email: string, temporary: string): Promise<string> {
    let output: InitiateAuthCommandOutput = await client.send(
      new InitiateAuthCommand({ ClientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: temporary } }),
    )
    if (output.ChallengeName === 'SELECT_CHALLENGE') {
      output = await client.send(
        new RespondToAuthChallengeCommand({ ClientId, ChallengeName: 'SELECT_CHALLENGE', Session: output.Session, ChallengeResponses: { USERNAME: email, ANSWER: 'PASSWORD', PASSWORD: temporary } }),
      )
    }
    if (output.ChallengeName !== 'NEW_PASSWORD_REQUIRED' || output.Session === undefined) {
      throw new Error(`Cognito did not ask the new demo account for NEW_PASSWORD_REQUIRED (${String(output.ChallengeName)}).`)
    }
    return output.Session
  }

  return {
    async create(account) {
      const Username = account.email
      if (!isDemoSessionAddress(Username)) throw new Error(`A demo session account must be on ${DEMO_SESSION_DOMAIN}.`)
      const temporary = newDemoPassword()
      const created = await client.send(
        new AdminCreateUserCommand({
          UserPoolId,
          Username,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: temporary,
          UserAttributes: [
            { Name: 'email', Value: Username },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      )
      const Session = await newPasswordSession(Username, temporary)
      await client.send(new RespondToAuthChallengeCommand({ ClientId, ChallengeName: 'NEW_PASSWORD_REQUIRED', Session, ChallengeResponses: { USERNAME: Username, NEW_PASSWORD: account.password } }))
      await client.send(new AdminAddUserToGroupCommand({ UserPoolId, Username, GroupName: account.group }))
      return subjectOf(created.User?.Attributes)
    },
  }
}
