import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { Answer } from '@/api';
import IncidentsRoute from '@/app/(renter)/r/[token]/incident/index';
import { createFakeApi } from '@/test/fake-api';
import { renderRoutes } from '@/test/render-router';
import { BIKE, HELMET, INCIDENT, incidents, TOKEN } from './fixtures';

const routes = {
  '(renter)/r/[token]/incident/index': IncidentsRoute,
  '(renter)/r/[token]/incident/[incidentId]': () => <Text>One report</Text>,
};

const open = (api = createFakeApi({ 'renter/incidents': { ok: true, value: incidents() } })) => renderRoutes(routes, { initialUrl: `/r/${TOKEN}/incident`, api });

describe('reporting that something happened', () => {
  it('puts the emergency number first, then the new report', async () => {
    await open();
    expect(await screen.findByText(/call the emergency number first/)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'City bike, blue' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'A mark or damage, such as a scratch or a dent' })).toBeChecked();
  });

  it("sends the item, the kind and the renter's own words, then opens the report", async () => {
    const api = createFakeApi({
      'renter/incidents': { ok: true, value: incidents() },
      'renter/actions/report-incident': { ok: true, value: { incidentId: INCIDENT } },
    });
    const view = await open(api);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Helmet M' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Something stopped working' }));
    await fireEvent.changeText(screen.getByLabelText('Describe what happened'), '  The strap buckle broke.  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(api.calls.find((call) => call.path === 'renter/actions/report-incident')?.options).toEqual({
      bearer: TOKEN,
      body: { itemId: HELMET, hint: 'fault', description: 'The strap buckle broke.' },
    });
    expect(await screen.findByText('One report')).toBeOnTheScreen();
    expect(view.getPathname()).toBe(`/r/${TOKEN}/incident/${INCIDENT}`);
  });

  it('asks for words before it sends anything', async () => {
    const api = createFakeApi({ 'renter/incidents': { ok: true, value: incidents() } });
    await open(api);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Describe what happened, in up to 1,000 characters.')).toBeOnTheScreen();
    expect(api.calls.map((call) => call.path)).toEqual(['renter/incidents']);
  });

  it("says why Hold refused the report, and keeps the renter's words", async () => {
    await open(
      createFakeApi({
        'renter/incidents': { ok: true, value: incidents({ items: [{ itemId: BIKE, label: 'City bike, blue' }] }) },
        'renter/actions/report-incident': { ok: false, failure: 'refused', reason: 'not_out' },
      }),
    );
    await fireEvent.changeText(await screen.findByLabelText('Describe what happened'), 'A dent.');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Reports are open while you have the items.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Describe what happened')).toHaveDisplayValue('A dent.');
    // One item needs no choosing.
    expect(screen.queryByRole('radio', { name: 'City bike, blue' })).toBeNull();
  });

  it('lists earlier reports, each opening its own page', async () => {
    const view = await open(
      createFakeApi({
        'renter/incidents': {
          ok: true,
          value: incidents({ open: false, earlier: [{ id: INCIDENT, state: 'triaged', kind: 'small_damage', itemLabel: 'City bike, blue', reportedAt: '2026-11-01T09:30:00.000Z' }] }),
        },
      }),
    );
    expect(await screen.findByText('Reports are open while you have the items. Contact the shop about anything else.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: /City bike, blue, Sorted/ }));
    expect(view.getPathname()).toBe(`/r/${TOKEN}/incident/${INCIDENT}`);
  });

  it('says when the phone is offline, and tries again', async () => {
    let answer: Answer<unknown> = { ok: false, failure: 'offline' };
    await open(createFakeApi({ 'renter/incidents': () => answer }));
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    answer = { ok: true, value: incidents() };
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeOnTheScreen();
  });
});
