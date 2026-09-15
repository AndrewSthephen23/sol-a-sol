import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('shows the app name as the main heading', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Sol a Sol' })).toBeInTheDocument();
  });

  it('shows the tagline in Spanish', () => {
    render(<HomePage />);

    expect(screen.getByText(/avanza hacia la libertad financiera/i)).toBeInTheDocument();
  });
});
