import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomePage from './page';

vi.mock('@/features/dashboard/dashboard-screen', () => ({
  DashboardScreen: ({ showCardAlerts }: { showCardAlerts: boolean }) => (
    <p>{showCardAlerts ? 'dashboard con tarjetas' : 'dashboard'}</p>
  ),
}));

describe('HomePage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('welcomes with the app name while the dashboard is off', () => {
    vi.stubEnv('FEATURE_REPORTS', 'false');
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Sol a Sol' })).toBeInTheDocument();
    expect(screen.getByText(/avanza hacia la libertad financiera/iu)).toBeInTheDocument();
  });

  it('shows the dashboard of the month when reports are on', () => {
    vi.stubEnv('FEATURE_REPORTS', 'true');
    render(<HomePage />);

    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('adds the card alerts only when credit cards are on', () => {
    vi.stubEnv('FEATURE_REPORTS', 'true');
    vi.stubEnv('FEATURE_CREDIT_CARDS', 'true');
    render(<HomePage />);

    expect(screen.getByText('dashboard con tarjetas')).toBeInTheDocument();
  });
});
