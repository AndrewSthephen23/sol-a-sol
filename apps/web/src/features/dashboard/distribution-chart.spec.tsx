import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DistributionChart } from './distribution-chart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('DistributionChart', () => {
  it('says so when nothing was spent, instead of an empty donut', () => {
    render(<DistributionChart distribution={[]} currency="PEN" categories={new Map()} />);

    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument();
  });

  it('says what it is given when nothing was spent', () => {
    render(
      <DistributionChart
        distribution={[]}
        currency="PEN"
        categories={new Map()}
        emptyText="Sin gastos este año."
      />,
    );

    expect(screen.getByText('Sin gastos este año.')).toBeInTheDocument();
  });

  it('lists the categories as plain text when there is nowhere to link them', () => {
    render(
      <DistributionChart
        distribution={[{ categoryId: 'food', amount: '30.00', share: '100' }]}
        currency="PEN"
        categories={
          new Map([
            [
              'food',
              {
                id: 'food',
                name: 'Comida',
                type: 'VARIABLE_EXPENSE',
                parentId: null,
                color: '#e53935',
                icon: 'cart',
                archivedAt: null,
                createdAt: '2026-09-01T00:00:00Z',
                updatedAt: '2026-09-01T00:00:00Z',
              },
            ],
          ])
        }
      />,
    );

    expect(screen.getByRole('list', { name: 'Gasto por categoría' })).toHaveTextContent(
      'Comida100.00 %S/ 30.00',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
