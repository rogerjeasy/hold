import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LoadState } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

const empty = { title: 'No rentals yet', body: 'Open a link.' };

describe('a screen loading from Hold', () => {
  it('says it is loading, and not that there is nothing', async () => {
    await renderWithProviders(<LoadState state={{ status: 'loading' }} onRetry={jest.fn()} empty={empty} isEmpty={() => true}>{() => null}</LoadState>);
    expect(screen.getByLabelText('Loading…')).toBeOnTheScreen();
    expect(screen.queryByText('No rentals yet')).toBeNull();
  });

  it('says what went wrong, that nothing changed, and tries again', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(<LoadState state={{ status: 'failed', failure: 'offline' }} onRetry={onRetry} empty={empty}>{() => null}</LoadState>);
    expect(screen.getByText('No connection')).toBeOnTheScreen();
    expect(screen.getByText(/Nothing was changed/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('names a refusal from Hold in words', async () => {
    await renderWithProviders(<LoadState state={{ status: 'failed', failure: 'link_invalid' }} onRetry={jest.fn()} empty={empty}>{() => null}</LoadState>);
    expect(screen.getByText('This link cannot be used')).toBeOnTheScreen();
  });

  it('says when there is nothing to show', async () => {
    await renderWithProviders(
      <LoadState state={{ status: 'ready', value: [], refreshing: false }} onRetry={jest.fn()} empty={empty} isEmpty={(value: unknown[]) => value.length === 0}>
        {() => <Text>list</Text>}
      </LoadState>,
    );
    expect(screen.getByText('No rentals yet')).toBeOnTheScreen();
    expect(screen.queryByText('list')).toBeNull();
  });

  it('shows the value when there is one', async () => {
    await renderWithProviders(
      <LoadState state={{ status: 'ready', value: ['Velo'], refreshing: false }} onRetry={jest.fn()} empty={empty} isEmpty={(value: string[]) => value.length === 0}>
        {(value) => <Text>{value.join()}</Text>}
      </LoadState>,
    );
    expect(screen.getByText('Velo')).toBeOnTheScreen();
  });
});
