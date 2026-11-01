import { renterActions, renterIncidentSchema, renterViews, type RenterActionInput, type RenterActionName, type RenterActionOutput, type RenterIncidentView, type RenterView, type RenterViewName } from '@hold/mobile-api';
import type { z } from 'zod';
import type { Answer, ApiClient } from '@/api';

// The renter's reads and actions through the app's client, each with the contract's own schema. The rental token is
// the bearer. An action's input is checked with the server's schema before it is sent, so a mistake is caught here
// with the same rule the server applies, and never reaches Hold.

export const readRenterView = <Name extends RenterViewName>(api: ApiClient, token: string, name: Name): Promise<Answer<RenterView<Name>>> =>
  api.request(`renter/${name}`, renterViews[name] as unknown as z.ZodType<RenterView<Name>>, { bearer: token });

export const readRenterIncident = (api: ApiClient, token: string, incidentId: string): Promise<Answer<RenterIncidentView>> =>
  api.request(`renter/incident/${encodeURIComponent(incidentId)}`, renterIncidentSchema, { bearer: token });

export async function actAsRenter<Name extends RenterActionName>(api: ApiClient, token: string, name: Name, input: RenterActionInput<Name>): Promise<Answer<RenterActionOutput<Name>>> {
  const checked = renterActions[name].input.safeParse(input);
  if (!checked.success) return { ok: false, failure: 'invalid', fields: [...new Set(checked.error.issues.map((issue) => issue.path.join('.')))] };
  return api.request(`renter/actions/${name}`, renterActions[name].output as unknown as z.ZodType<RenterActionOutput<Name>>, { bearer: token, body: checked.data as Record<string, unknown> });
}
