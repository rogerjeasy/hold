import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { DEMO_SESSION_DOMAIN, isDemoSessionAddress } from '../demo-accounts.ts'

// The worker's daily cleanup removes a retired demo's two accounts (architecture.md section 20.3). Only the cleanup's
// own role may delete a user, and only in Hold's pool; here, too, an address outside the demo's domain is refused
// before Cognito is called, so no real person's account can be removed.

export type DemoAccountRemoval = { readonly remove: (email: string) => Promise<void> }

export function createDemoAccountRemoval(
  settings: { readonly region: string; readonly userPoolId: string },
  client: Pick<CognitoIdentityProviderClient, 'send'> = new CognitoIdentityProviderClient({ region: settings.region }),
): DemoAccountRemoval {
  return {
    async remove(email) {
      if (!isDemoSessionAddress(email)) throw new Error(`Only an account on ${DEMO_SESSION_DOMAIN} is removed.`)
      try {
        await client.send(new AdminDeleteUserCommand({ UserPoolId: settings.userPoolId, Username: email }))
      } catch (error) {
        // Already gone, as after a run that removed it and stopped before marking the shop.
        if (error instanceof Error && error.name === 'UserNotFoundException') return
        throw error
      }
    },
  }
}
