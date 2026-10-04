import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('shows its actions after the sections', () => {
    render(
      <Sidebar
        manifests={manifests}
        isEnabled={() => true}
        actions={<button type="button">Cerrar sesión</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
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

  describe('on a phone (decided 2026-10-04)', () => {
    const withInbox: FeatureManifest[] = [
      ...manifests,
      {
        id: 'capture',
        title: 'Bandeja',
        route: '/capture',
        icon: 'square',
        pinned: true,
        counter: <span>3</span>,
      },
    ];

    it('folds the sections behind «Menú» and opens them', async () => {
      render(<Sidebar manifests={withInbox} isEnabled={() => true} />);
      const button = screen.getByRole('button', { name: 'Menú' });
      const list = screen.getByRole('list');

      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-controls', list.id);
      expect(list).toHaveClass('hidden', 'md:flex');

      await userEvent.setup().click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(list).toHaveClass('flex');
      expect(list).not.toHaveClass('hidden');
    });

    it('keeps a pinned section in sight, outside the folded list, with its counter', () => {
      render(<Sidebar manifests={withInbox} isEnabled={() => true} />);

      const inbox = screen.getByRole('link', { name: 'Bandeja 3' });
      expect(inbox).toHaveAttribute('href', '/capture');
      expect(within(screen.getByRole('list')).queryByRole('link', { name: /Bandeja/u })).toBeNull();
      expect(
        within(screen.getByRole('list')).getByRole('link', { name: 'Presupuesto' }),
      ).toBeVisible();
    });
  });
});
