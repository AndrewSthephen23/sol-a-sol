import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type FeatureManifest } from './navigation';
import { Sidebar } from './sidebar';

const manifests: FeatureManifest[] = [
  { id: 'dashboard', title: 'Resumen', route: '/', icon: 'home' },
  {
    id: 'budgeting',
    title: 'Presupuesto',
    route: '/presupuesto',
    icon: 'wallet',
    flag: 'FEATURE_BUDGETING',
  },
];

describe('Sidebar', () => {
  it('shows a link per visible feature', () => {
    render(<Sidebar manifests={manifests} isEnabled={() => true} />);

    expect(screen.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Presupuesto' })).toHaveAttribute(
      'href',
      '/presupuesto',
    );
  });

  it('hides the features whose flag is off', () => {
    render(<Sidebar manifests={manifests} isEnabled={() => false} />);

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Presupuesto' })).not.toBeInTheDocument();
  });

  it('is a navigation landmark with an accessible name', () => {
    render(<Sidebar manifests={manifests} isEnabled={() => true} />);

    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument();
  });
});
