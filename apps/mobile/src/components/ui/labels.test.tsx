import { screen } from '@testing-library/react-native';
import { SampleLabel, StatusPill } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('a sample label', () => {
  it('marks anything simulated as a sample, in words', async () => {
    await renderWithProviders(<SampleLabel />);
    expect(screen.getByText('Sample')).toBeOnTheScreen();
  });

  it('can name the simulation its own way', async () => {
    await renderWithProviders(<SampleLabel kind="simulated" />);
    expect(screen.getByText('Simulated')).toBeOnTheScreen();
  });
});

describe('a status pill', () => {
  it('carries its meaning in its words', async () => {
    await renderWithProviders(<StatusPill tone="warning" label="Overdue" />);
    expect(screen.getByText('Overdue')).toBeOnTheScreen();
  });
});
