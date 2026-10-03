import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { SummaryScreen, type SummarySections } from './summary-screen';

const CLOCK = FixedClock.at('2026-10-03T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const ALL_ON: SummarySections = { budget: true, cards: true, goals: true };

const navigation = vi.hoisted(() => ({ search: '', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/reports',
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function comparison(amount: string, previous: string, difference: string, change: string | null) {
  return { amount, previous, difference, change };
}

function soles(extra: object = {}) {
  return {
    currency: 'PEN',
    totals: {
      income: '3000.00',
      expense: '110.00',
      saving: '500.00',
      debt: '0.00',
      balance: '2390.00',
    },
    savingsRate: '16.6666666666',
    byType: [
      { type: 'INCOME', ...comparison('3000.00', '3000.00', '0.00', '0') },
      { type: 'FIXED_EXPENSE', ...comparison('0.00', '0.00', '0.00', null) },
      { type: 'VARIABLE_EXPENSE', ...comparison('110.00', '40.00', '70.00', '175') },
      { type: 'SAVING', ...comparison('500.00', '0.00', '500.00', null) },
      { type: 'INVESTMENT', ...comparison('0.00', '0.00', '0.00', null) },
      { type: 'DEBT', ...comparison('0.00', '0.00', '0.00', null) },
    ],
    byCategory: [
      {
        categoryId: FOOD,
        type: 'VARIABLE_EXPENSE',
        ...comparison('110.00', '40.00', '70.00', '175'),
      },
    ],
    topCategories: [{ categoryId: FOOD, amount: '110.00', share: '100' }],
    topMerchants: [{ merchant: 'TAMBO', amount: '110.00', count: 2 }],
    ...extra,
  };
}

function september(extra: object = {}) {
  return {
    year: 2026,
    month: 9,
    period: { from: '2026-09-01', to: '2026-09-30', complete: true },
    previousPeriod: { from: '2026-08-01', to: '2026-08-31' },
    currencies: [soles()],
    budget: {
      status: 'SET',
      currencies: [{ currency: 'PEN', planned: '100.00', actual: '110.00', executed: '110' }],
      exceeded: [
        {
          categoryId: FOOD,
          type: 'VARIABLE_EXPENSE',
          currency: 'PEN',
          planned: '100.00',
          actual: '110.00',
          difference: '-10.00',
          executed: '110',
        },
      ],
    },
    cards: [
      {
        id: 'visa',
        alias: 'Visa',
        institution: 'BCP',
        last4: '4321',
        charges: [{ amount: '50.00', currency: 'PEN' }],
        statement: {
          closingDate: '2026-09-20',
          dueDate: '2026-10-15',
          balances: [{ currency: 'PEN', balance: '50.00', remaining: '50.00' }],
        },
      },
    ],
    goals: [
      {
        id: 'trip',
        name: 'Viaje',
        currency: 'PEN',
        contributed: '300.00',
        saved: '300.00',
        remaining: '900.00',
        percentage: '25',
        suggestedMonthly: '300.00',
        status: 'AT_RISK',
      },
    ],
    ...extra,
  };
}

/** Una API falsa: el resumen, las categorías y el CSV; cada petición se anota. */
function setup(options: { summary?: unknown; failures?: number; sections?: SummarySections } = {}) {
  const asked: string[] = [];
  let failures = options.failures ?? 0;
  const session = new Session({
    fetch: (input) => {
      if (!(input instanceof Request))
        return Promise.resolve(Response.json({ accessToken: 'token' }));
      const url = new URL(input.url);
      asked.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/api/v1/categories') {
        return Promise.resolve(
          Response.json([
            {
              id: FOOD,
              name: 'Víveres',
              type: 'VARIABLE_EXPENSE',
              parentId: null,
              color: '#E53935',
              icon: 'cart',
              archivedAt: null,
              createdAt: '2026-09-01T00:00:00Z',
              updatedAt: '2026-09-01T00:00:00Z',
              children: [],
            },
          ]),
        );
      }
      if (url.pathname.endsWith('/export')) {
        return Promise.resolve(
          new Response('﻿Sección;Concepto\r\n', {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="resumen-2026-09.csv"',
            },
          }),
        );
      }
      if (failures > 0) {
        failures -= 1;

        return Promise.resolve(Response.json({}, { status: 500 }));
      }

      return Promise.resolve(Response.json(options.summary ?? september()));
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <SummaryScreen clock={CLOCK} sections={options.sections ?? ALL_ON} />
      </QueryProvider>
    </SessionProvider>,
  );

  return { asked };
}

describe('SummaryScreen', () => {
  beforeEach(() => {
    navigation.search = '?month=2026-09';
    navigation.push.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a whole month in words, per currency, against the previous one', async () => {
    const { asked } = setup();

    const pen = await screen.findByRole('region', { name: 'Soles' });
    expect(pen).toHaveTextContent('Ingresos: S/ 3,000.00');
    expect(pen).toHaveTextContent('Igual que en agosto');
    expect(pen).toHaveTextContent('Gasto variable: S/ 110.00');
    expect(pen).toHaveTextContent('S/ 70.00 más que en agosto (+175.00 %)');
    expect(pen).toHaveTextContent('S/ 500.00 más que en agosto (—)');
    expect(pen).toHaveTextContent('Saldo del mes: S/ 2,390.00');
    expect(pen).toHaveTextContent('Ahorraste el 16.67 % de lo que ganaste');
    expect(within(pen).getByRole('region', { name: 'En qué gastaste más' })).toHaveTextContent(
      'Víveres: S/ 110.00 (100.00 % del gasto)',
    );
    expect(within(pen).getByRole('region', { name: 'Dónde gastaste más' })).toHaveTextContent(
      'TAMBO: S/ 110.00 en 2 compras',
    );
    expect(asked).toContain('/api/v1/reports/monthly-summary?year=2026&month=9');
  });

  it('shows the budget, the cards and the goals', async () => {
    setup();

    expect(await screen.findByRole('region', { name: 'Presupuesto' })).toHaveTextContent(
      'Ejecutaste el 110.00 % de tu presupuesto: S/ 110.00 de S/ 100.00Víveres: te pasaste por S/ 10.00 (110.00 %)',
    );
    expect(screen.getByRole('region', { name: 'Tarjetas' })).toHaveTextContent(
      'Visa BCP •••• 4321Consumiste S/ 50.00 en setiembreEstado del 20 de setiembre: por pagar S/ 50.00',
    );
    expect(screen.getByRole('region', { name: 'Metas' })).toHaveTextContent(
      'ViajeAportaste S/ 300.00 este mesLlevas S/ 300.00 (25.00 %), en riesgo',
    );
  });

  it('says when there is no income and no budget', async () => {
    setup({
      summary: september({
        currencies: [soles({ savingsRate: null })],
        budget: { status: 'NONE' },
      }),
    });

    expect(await screen.findByText('Sin ingresos este mes')).toBeInTheDocument();
    const budget = screen.getByRole('region', { name: 'Presupuesto' });
    expect(budget).toHaveTextContent('No armaste un presupuesto para este mes.');
    expect(within(budget).getByRole('link', { name: 'Armarlo' })).toHaveAttribute(
      'href',
      '/budgeting?month=2026-09',
    );
  });

  it('says there are no movements in the month', async () => {
    setup({ summary: september({ currencies: [] }) });

    expect(
      await screen.findByText('No hay movimientos en setiembre de 2026 ni en el mes anterior.'),
    ).toBeInTheDocument();
  });

  it('shows each currency apart, soles first', async () => {
    setup({
      summary: september({
        currencies: [soles(), soles({ currency: 'USD', topMerchants: [] })],
      }),
    });

    const regions = await screen.findAllByRole('region', { name: /^(Soles|Dólares)$/u });
    expect(regions.map((region) => region.getAttribute('aria-labelledby'))).toEqual([
      'summary-PEN',
      'summary-USD',
    ]);
  });

  it.each([
    ['budget', 'Presupuesto'],
    ['cards', 'Tarjetas'],
    ['goals', 'Metas'],
  ] as const)('does not draw the %s of a switched-off module', async (section, title) => {
    setup({ sections: { ...ALL_ON, [section]: false } });

    await screen.findByRole('region', { name: 'Soles' });
    expect(screen.queryByRole('region', { name: title })).not.toBeInTheDocument();
  });

  it('asks only the summary: switched-off modules are never asked separately', async () => {
    const { asked } = setup({ sections: { budget: false, cards: false, goals: false } });

    await screen.findByRole('region', { name: 'Soles' });
    expect(asked.filter((path) => !path.startsWith('/api/v1/categories'))).toEqual([
      '/api/v1/reports/monthly-summary?year=2026&month=9',
    ]);
  });

  it('offers to try again when it does not load', async () => {
    setup({ failures: 1 });

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('region', { name: 'Soles' })).toBeInTheDocument();
  });

  it('shows the month of today instead of a month that has not started', async () => {
    navigation.search = '?month=2026-12';
    const { asked } = setup();

    await screen.findByRole('region', { name: 'Soles' });
    expect(asked).toContain('/api/v1/reports/monthly-summary?year=2026&month=10');
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
  });

  it('downloads the CSV with the name the API gives', async () => {
    const createObjectURL = vi.fn(() => 'blob:resumen');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { asked } = setup();
    await screen.findByRole('region', { name: 'Soles' });

    await userEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));

    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce();
    });
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('resumen-2026-09.csv');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:resumen');
    expect(asked).toContain('/api/v1/reports/monthly-summary/export?year=2026&month=9&format=csv');
    click.mockRestore();
  });
});
