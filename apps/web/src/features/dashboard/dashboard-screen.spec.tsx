import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { DashboardScreen } from './dashboard-screen';

const navigation = vi.hoisted(() => ({ search: '', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

// 28 de setiembre de 2026 en Lima.
const CLOCK = FixedClock.at('2026-09-28T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const RENT = '22222222-2222-4222-8222-222222222222';
const SALARY = '33333333-3333-4333-8333-333333333333';

const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function category(id: string, name: string, type: string, color: string) {
  return {
    id,
    name,
    type,
    parentId: null,
    color,
    icon: 'tag',
    archivedAt: null,
    children: [],
    ...STAMPS,
  };
}

const CATEGORIES = [
  category(FOOD, 'Comida', 'VARIABLE_EXPENSE', '#16a34a'),
  category(RENT, 'Alquiler', 'FIXED_EXPENSE', '#2563eb'),
  category(SALARY, 'Sueldo', 'INCOME', '#f59e0b'),
];

const SEPTEMBER = {
  year: 2026,
  month: 9,
  currencies: [
    {
      currency: 'PEN',
      kpis: {
        income: '4000.00',
        expense: '1800.00',
        saving: '0.00',
        debt: '0.00',
        balance: '2200.00',
      },
      daily: [
        { date: '2026-09-01', amount: '1500.00' },
        { date: '2026-09-02', amount: '0.00' },
        { date: '2026-09-03', amount: '300.00' },
      ],
      distribution: [
        { categoryId: RENT, amount: '1500.00', share: '83.333333' },
        { categoryId: FOOD, amount: '250.00', share: '13.888888' },
        { categoryId: null, amount: '50.00', share: '2.777777' },
      ],
      byType: [
        {
          type: 'INCOME',
          total: '4000.00',
          categories: [{ categoryId: SALARY, amount: '4000.00' }],
        },
        {
          type: 'FIXED_EXPENSE',
          total: '1500.00',
          categories: [{ categoryId: RENT, amount: '1500.00' }],
        },
      ],
    },
    {
      currency: 'USD',
      kpis: { income: '0.00', expense: '20.00', saving: '0.00', debt: '0.00', balance: '-20.00' },
      daily: [{ date: '2026-09-01', amount: '20.00' }],
      distribution: [{ categoryId: FOOD, amount: '20.00', share: '100' }],
      byType: [
        {
          type: 'VARIABLE_EXPENSE',
          total: '20.00',
          categories: [{ categoryId: FOOD, amount: '20.00' }],
        },
      ],
    },
  ],
};

/**
 * Una API falsa: `report` responde el dashboard, y cada petición queda anotada. Con `cards`, el
 * flag de tarjetas está encendido y `/credit-cards/status` responde esas tarjetas.
 */
function setup(report: (url: URL) => Response, cards?: unknown[], captures?: unknown[]) {
  const requests: URL[] = [];
  const session = new Session({
    fetch: (input) => {
      if (!(input instanceof Request))
        return Promise.resolve(Response.json({ accessToken: 'token' }));
      const url = new URL(input.url);
      if (url.pathname === '/api/v1/categories') return Promise.resolve(Response.json(CATEGORIES));
      requests.push(url);
      if (url.pathname === '/api/v1/credit-cards/status') {
        return Promise.resolve(Response.json(cards ?? []));
      }
      if (url.pathname === '/api/v1/captures') {
        return Promise.resolve(Response.json({ items: captures ?? [], nextCursor: null }));
      }

      return Promise.resolve(report(url));
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <DashboardScreen
          clock={CLOCK}
          showCardAlerts={cards !== undefined}
          showPendingCaptures={captures !== undefined}
        />
      </QueryProvider>
    </SessionProvider>,
  );

  return { requests };
}

describe('DashboardScreen', () => {
  beforeAll(() => {
    // jsdom no mide nada: Recharts solo necesita que exista.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  beforeEach(() => {
    navigation.search = '';
    navigation.push.mockClear();
  });

  it('asks for the current month in Lima and shows the KPIs of each currency apart', async () => {
    const { requests } = setup(() => Response.json(SEPTEMBER));

    const soles = await screen.findByLabelText('Resumen en soles');
    expect(soles).toHaveTextContent('IngresosS/ 4,000.00');
    expect(soles).toHaveTextContent('GastosS/ 1,800.00');
    expect(soles).toHaveTextContent('SaldoS/ 2,200.00');
    expect(within(soles).getByText('S/ 2,200.00')).not.toHaveClass('text-red-700');

    // El saldo negativo va en rojo **y** con su signo.
    const dollars = screen.getByLabelText('Resumen en dólares');
    expect(within(dollars).getByText('-US$ 20.00')).toHaveClass('text-red-700');

    expect(requests[0]?.pathname).toBe('/api/v1/reports/monthly');
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      year: '2026',
      month: '9',
    });
  });

  it('says in words what the daily bars show', async () => {
    setup(() => Response.json(SEPTEMBER));

    const soles = await screen.findByRole('region', { name: 'Soles' });
    expect(soles).toHaveTextContent(
      'S/ 1,800.00 gastados en 3 días. El día de más gasto fue el martes, 1 de setiembre, con S/ 1,500.00.',
    );
  });

  it('lists the spending by category with its share, «Otras» last and without a link', async () => {
    setup(() => Response.json(SEPTEMBER));

    const legend = within(await screen.findByRole('region', { name: 'Soles' })).getByRole('list', {
      name: 'Gasto por categoría',
    });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Alquiler83.33 %S/ 1,500.00', 'Comida13.89 %S/ 250.00', 'Otras2.78 %S/ 50.00']);
    expect(within(legend).getByRole('link', { name: /Comida/u })).toHaveAttribute(
      'href',
      `/transactions?month=2026-09&categoryId=${FOOD}`,
    );
    expect(within(legend).queryByRole('link', { name: /Otras/u })).toBeNull();
  });

  it('shows a table per type, with its total', async () => {
    setup(() => Response.json(SEPTEMBER));

    const income = await screen.findByRole('table', { name: 'Ingreso' });
    expect(within(income).getByRole('row', { name: 'Sueldo S/ 4,000.00' })).toBeInTheDocument();
    expect(within(income).getByRole('row', { name: 'Total S/ 4,000.00' })).toBeInTheDocument();
  });

  it('reads the month from the URL and moves between months', async () => {
    navigation.search = 'month=2026-08';
    const { requests } = setup(() => Response.json({ year: 2026, month: 8, currencies: [] }));

    expect(await screen.findByText('No hay movimientos en agosto de 2026.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar un movimiento' })).toHaveAttribute(
      'href',
      '/transactions/new',
    );
    expect(requests[0]?.searchParams.get('month')).toBe('8');

    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(navigation.push).toHaveBeenCalledWith('/?month=2026-07', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/', { scroll: false });
  });

  it('offers to retry when the dashboard does not load', async () => {
    let attempts = 0;
    setup(() => {
      attempts += 1;

      return attempts === 1 ? new Response(null, { status: 500 }) : Response.json(SEPTEMBER);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByLabelText('Resumen en soles')).toBeInTheDocument();
  });

  describe('card alerts', () => {
    function visa(status: Record<string, unknown>) {
      return {
        id: 'card-visa',
        paymentMethod: {
          id: 'method-visa',
          alias: 'Visa',
          institution: 'BCP',
          last4: '4321',
          currency: null,
          archived: false,
        },
        creditLimit: { amount: '5000.00', currency: 'PEN' },
        statementDay: 20,
        paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 26 },
        openingBalance: null,
        status: {
          cycle: { start: '2026-09-21', end: '2026-10-20' },
          currencies: [],
          statement: {
            start: '2026-08-21',
            end: '2026-09-20',
            dueDate: '2026-10-16',
            daysLeft: 18,
            paid: false,
            balances: [
              { currency: 'PEN', balance: '1234.50', credited: '0.00', remaining: '1234.50' },
            ],
          },
          utilization: { percentage: '10', level: 'OK' },
          paymentAlert: null,
          ...status,
        },
      };
    }

    it('asks nothing about cards while they are off', async () => {
      const { requests } = setup(() => Response.json(SEPTEMBER));

      await screen.findByLabelText('Resumen en soles');
      expect(requests.map((url) => url.pathname)).not.toContain('/api/v1/credit-cards/status');
      expect(screen.queryByRole('region', { name: 'Tarjetas' })).not.toBeInTheDocument();
    });

    it('shows no block when no card needs attention', async () => {
      const { requests } = setup(() => Response.json(SEPTEMBER), [visa({})]);

      await screen.findByLabelText('Resumen en soles');
      expect(requests.map((url) => url.pathname)).toContain('/api/v1/credit-cards/status');
      expect(screen.queryByRole('region', { name: 'Tarjetas' })).not.toBeInTheDocument();
    });

    it('says in words what happens with each card, and links to it', async () => {
      setup(
        () => Response.json(SEPTEMBER),
        [
          visa({
            utilization: { percentage: '82.5', level: 'CRITICAL' },
            paymentAlert: { status: 'DUE_SOON', daysLeft: 3 },
          }),
        ],
      );

      const block = await screen.findByRole('region', { name: 'Tarjetas' });
      expect(block).toHaveTextContent('Usas el 82.50 % de la línea: nivel crítico');
      expect(block).toHaveTextContent('Pagas S/ 1,234.50 el viernes, 16 de octubre, en 3 días');
      expect(within(block).getByRole('link', { name: 'Visa BCP •••• 4321' })).toHaveAttribute(
        'href',
        '/credit-cards#tarjeta-card-visa',
      );
    });
  });

  describe('pending captures (decision 17 of H7)', () => {
    it('says how many captures wait in the inbox, with a link to it', async () => {
      setup(() => Response.json(SEPTEMBER), undefined, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

      expect(await screen.findByText(/Tienes 3 capturas por revisar/u)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a la bandeja' })).toHaveAttribute(
        'href',
        '/capture',
      );
    });

    it('says nothing when the inbox is empty', async () => {
      const { requests } = setup(() => Response.json(SEPTEMBER), undefined, []);

      await waitFor(() => {
        expect(requests.some((url) => url.pathname === '/api/v1/captures')).toBe(true);
      });
      expect(screen.queryByText(/por revisar/u)).not.toBeInTheDocument();
    });

    it('asks nothing about captures while the module is off', async () => {
      const { requests } = setup(() => Response.json(SEPTEMBER));

      await screen.findByRole('heading', { name: 'Inicio' });
      expect(requests.some((url) => url.pathname === '/api/v1/captures')).toBe(false);
    });
  });
});
