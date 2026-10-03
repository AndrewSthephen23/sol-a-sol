import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { AnnualScreen } from './annual-screen';

const CLOCK = FixedClock.at('2026-10-03T15:00:00Z');
const navigation = vi.hoisted(() => ({ search: '', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/reports/annual',
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function months(january: string, september: string): (string | null)[] {
  return [january, ...Array.from({ length: 7 }, () => '0.00'), september, '0.00', null, null];
}

function currency(code: 'PEN' | 'USD', savingsRate: string | null = '16.6666') {
  return {
    currency: code,
    rows: [
      { row: 'INCOME', months: months('3000.00', '0.00'), total: '3000.00' },
      { row: 'FIXED_EXPENSE', months: months('0.00', '0.00'), total: '0.00' },
      { row: 'VARIABLE_EXPENSE', months: months('0.00', '110.00'), total: '110.00' },
      { row: 'EXPENSE', months: months('0.00', '110.00'), total: '110.00' },
      { row: 'SAVING', months: months('500.00', '0.00'), total: '500.00' },
      { row: 'INVESTMENT', months: months('0.00', '0.00'), total: '0.00' },
      { row: 'DEBT', months: months('0.00', '0.00'), total: '0.00' },
      { row: 'BALANCE', months: months('2500.00', '-110.00'), total: '2390.00' },
    ],
    savingsRate,
    distribution: [{ categoryId: null, amount: '110.00', share: '100' }],
  };
}

function setup(options: { body?: unknown; failures?: number } = {}) {
  const asked: string[] = [];
  let failures = options.failures ?? 0;
  const session = new Session({
    fetch: (input) => {
      if (!(input instanceof Request))
        return Promise.resolve(Response.json({ accessToken: 'token' }));
      const url = new URL(input.url);
      asked.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/api/v1/categories') return Promise.resolve(Response.json([]));
      if (failures > 0) {
        failures -= 1;

        return Promise.resolve(Response.json({}, { status: 500 }));
      }

      return Promise.resolve(
        Response.json(options.body ?? { year: 2026, currencies: [currency('PEN')] }),
      );
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <AnnualScreen clock={CLOCK} />
      </QueryProvider>
    </SessionProvider>,
  );

  return { asked };
}

describe('AnnualScreen', () => {
  beforeEach(() => {
    navigation.search = '';
    navigation.push.mockClear();
  });

  it('reads the year in a table, month by month, even where the chart is not drawn', async () => {
    const { asked } = setup();

    const table = await screen.findByRole('table', { name: '2026 mes a mes, en soles' });
    const income = within(table).getByRole('row', { name: /^Ingresos/u });
    expect(
      within(income)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'S/ 3,000.00',
      ...Array.from({ length: 7 }, () => 'S/ 0.00'),
      'S/ 0.00',
      'S/ 0.00',
      '—',
      '—',
      'S/ 3,000.00',
    ]);
    expect(within(table).getByRole('row', { name: /^Saldo/u })).toHaveTextContent('-S/ 110.00');
    expect(screen.getByText('En 2026 ahorraste el 16.67 % de lo que ganaste')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Gasto por categoría' })).toHaveTextContent(
      'Otras100.00 %S/ 110.00',
    );
    expect(asked).toContain('/api/v1/reports/annual?year=2026');
  });

  it('says when there was no income in the year', async () => {
    setup({ body: { year: 2026, currencies: [currency('PEN', null)] } });

    expect(await screen.findByText('En 2026 no hubo ingresos')).toBeInTheDocument();
  });

  it('shows each currency apart', async () => {
    setup({ body: { year: 2026, currencies: [currency('PEN'), currency('USD')] } });

    expect(
      await screen.findByRole('table', { name: '2026 mes a mes, en soles' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '2026 mes a mes, en dólares' })).toHaveTextContent(
      'US$ 3,000.00',
    );
  });

  it('says there are no movements in an empty year', async () => {
    navigation.search = '?year=2024';
    const { asked } = setup({ body: { year: 2024, currencies: [] } });

    expect(await screen.findByText('No hay movimientos en 2024.')).toBeInTheDocument();
    expect(asked).toContain('/api/v1/reports/annual?year=2024');
  });

  it('offers to try again when it does not load', async () => {
    setup({ failures: 1 });

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('moves between years without offering one that has not started', async () => {
    navigation.search = '?year=2025';
    setup({ body: { year: 2025, currencies: [] } });
    await screen.findByText('No hay movimientos en 2025.');

    await userEvent.click(screen.getByRole('button', { name: 'Año siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Año anterior' }));

    expect(navigation.push.mock.calls.map(([path]) => path as string)).toEqual([
      '/reports/annual',
      '/reports/annual?year=2024',
    ]);
  });

  it('shows the year of today instead of a year that has not started', async () => {
    navigation.search = '?year=2030';
    const { asked } = setup();

    await screen.findByRole('table');
    expect(asked).toContain('/api/v1/reports/annual?year=2026');
    expect(screen.getByRole('button', { name: 'Año siguiente' })).toBeDisabled();
  });

  it('switches to the monthly view with its tab', async () => {
    setup();

    const tabs = await screen.findByRole('navigation', { name: 'Vistas del resumen' });
    expect(within(tabs).getByRole('link', { name: 'Anual' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Mensual' })).toHaveAttribute('href', '/reports');
  });
});
