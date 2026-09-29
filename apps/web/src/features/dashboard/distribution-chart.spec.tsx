import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DistributionChart } from './distribution-chart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('DistributionChart', () => {
  it('says so when nothing was spent, instead of an empty donut', () => {
    render(
      <DistributionChart distribution={[]} currency="PEN" month="2026-09" categories={new Map()} />,
    );

    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument();
  });
});
