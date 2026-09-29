import { FixedClock } from '@sol-a-sol/domain';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { SEARCH_DEBOUNCE_MS } from './filter-bar';
import { TransactionsScreen } from './transactions-screen';

const navigation = vi.hoisted(() => ({
  search: '',
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => '/transactions',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

// 28 de setiembre de 2026 en Lima.
const CLOCK = FixedClock.at('2026-09-28T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const SALARY = '22222222-2222-4222-8222-222222222222';
const BCP = '33333333-3333-4333-8333-333333333333';
const YAPE = '44444444-4444-4444-8444-444444444444';

const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function category(id: string, name: string, type: string, archived = false) {
  return {
    id,
    name,
    type,
    parentId: null,
    color: '#f59e0b',
    icon: 'tag',
    archivedAt: archived ? STAMPS.createdAt : null,
    children: [],
    ...STAMPS,
  };
}

function method(id: string, alias: string, last4: string | null = null) {
  return {
    id,
    alias,
    kind: 'ACCOUNT',
    institution: 'BCP',
    last4,
    currency: 'PEN',
    archivedAt: null,
    ...STAMPS,
  };
}

function expense(
  id: string,
  date: string,
  description: string,
  amount: string,
  tags: string[] = [],
) {
  return {
    kind: 'transaction',
    id,
    date,
    type: 'VARIABLE_EXPENSE',
    categoryId: FOOD,
    amount,
    currency: 'PEN',
    description,
    paymentMethodId: BCP,
    merchant: null,
    source: 'MANUAL',
    captureId: null,
    tags,
    ...STAMPS,
  };
}

const TOTALS = [
  {
    currency: 'PEN',
    income: '3000.00',
    expense: '1234.50',
    saving: '0.00',
    debt: '0.00',
    balance: '1765.50',
    count: 3,
  },
];

type Answer = (url: URL) => Response | Promise<Response>;

/** Una API falsa: `transactions` decide qué devuelve la lista según la query. */
function setup(transactions: Answer) {
  const lists: URL[] = [];
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const url = new URL(input.url);
      switch (url.pathname) {
        case '/api/v1/categories':
          return Response.json([
            category(FOOD, 'Comida', 'VARIABLE_EXPENSE'),
            category(SALARY, 'Sueldo', 'INCOME'),
            category('55555555-5555-4555-8555-555555555555', 'Cine', 'VARIABLE_EXPENSE', true),
          ]);
        case '/api/v1/payment-methods':
          return Response.json([method(BCP, 'BCP Sueldo'), method(YAPE, 'Visa', '1234')]);
        case '/api/v1/tags':
          return Response.json([
            { id: '66666666-6666-4666-8666-666666666666', name: 'viaje', transactionCount: 1 },
          ]);
        default:
          lists.push(url);
          return transactions(url);
      }
    },
  });
  session.signIn('token');
  const client = createQueryClient();

  render(
    <SessionProvider session={session}>
      <QueryProvider client={client}>
        <TransactionsScreen clock={CLOCK} />
      </QueryProvider>
    </SessionProvider>,
  );

  return { lists, session, client };
}

const page = (items: unknown[], nextCursor: string | null = null, totals: unknown[] = TOTALS) =>
  Response.json({ items, nextCursor, totals });

describe('TransactionsScreen', () => {
  beforeEach(() => {
    navigation.search = '';
    navigation.push.mockClear();
    navigation.replace.mockClear();
  });

  it('asks for the current month in Lima and groups what comes back by day', async () => {
    const { lists } = setup(() =>
      page([
        expense('a', '2026-09-28', 'Almuerzo', '25.90', ['viaje']),
        expense('b', '2026-09-28', 'Pan', '4.50'),
        expense('c', '2026-09-27', 'Mercado', '1204.10'),
      ]),
    );

    const today = await screen.findByRole('region', { name: 'lunes, 28 de setiembre' });
    expect(
      within(today)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining('Almuerzo'),
      expect.stringContaining('#viaje'),
      expect.stringContaining('Pan'),
    ]);
    expect(within(today).getAllByText('Comida · BCP Sueldo')).toHaveLength(2);
    expect(within(today).getByText('-S/ 25.90')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'domingo, 27 de setiembre' })).toHaveTextContent(
      '-S/ 1,204.10',
    );
    expect(lists[0]?.searchParams.get('month')).toBe('2026-09');
  });

  it('shows the totals of everything filtered, per currency', async () => {
    setup(() => page([expense('a', '2026-09-28', 'Almuerzo', '25.90')]));

    const totals = await screen.findByLabelText('Totales en soles');
    expect(totals).toHaveTextContent('IngresosS/ 3,000.00');
    expect(totals).toHaveTextContent('GastosS/ 1,234.50');
    expect(totals).toHaveTextContent('BalanceS/ 1,765.50');
  });

  it('shows a transfer with both accounts, and what arrived when the currency changed', async () => {
    setup(() =>
      page([
        {
          kind: 'transfer',
          id: 't',
          date: '2026-09-28',
          fromPaymentMethodId: BCP,
          toPaymentMethodId: YAPE,
          amount: '100.00',
          currency: 'USD',
          receivedAmount: '370.00',
          receivedCurrency: 'PEN',
          description: 'Cambio de dólares',
          source: 'MANUAL',
          ...STAMPS,
        },
      ]),
    );

    const row = (await screen.findByText('Cambio de dólares')).closest('li');
    expect(row).toHaveTextContent('Transferencia · BCP Sueldo → Visa ···· 1234');
    expect(row).toHaveTextContent('US$ 100.00→ S/ 370.00');
  });

  it('says the month is empty, naming it', async () => {
    setup(() => page([], null, []));

    expect(await screen.findByText('No hay movimientos en setiembre de 2026.')).toBeInTheDocument();
  });

  it('says nothing matches when a filter leaves the month empty', async () => {
    navigation.search = 'show=INCOME';
    setup(() => page([], null, []));

    expect(
      await screen.findByText('Ningún movimiento coincide con estos filtros.'),
    ).toBeInTheDocument();
  });

  it('explains a failure and can try again', async () => {
    let fail = true;
    setup(() =>
      fail
        ? new Response(null, { status: 500 })
        : page([expense('a', '2026-09-28', 'Pan', '4.50')]),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar los movimientos.');

    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pan')).toBeInTheDocument();
  });

  it('loads the next page with the cursor the API gave', async () => {
    const { lists } = setup((url) =>
      url.searchParams.get('cursor') === 'next'
        ? page([expense('b', '2026-09-01', 'Mercado', '80.00')])
        : page([expense('a', '2026-09-28', 'Pan', '4.50')], 'next'),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText('Mercado')).toBeInTheDocument();
    expect(screen.getByText('Pan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(lists.map((url) => url.searchParams.get('cursor'))).toEqual([null, 'next']);
  });

  it('reads the filters from the URL and sends them to the API', async () => {
    navigation.search = `month=2026-08&show=VARIABLE_EXPENSE&categoryId=${FOOD}&tag=viaje&q=pan`;
    const { lists } = setup(() => page([]));

    await screen.findByText('Ningún movimiento coincide con estos filtros.');
    expect(Object.fromEntries(lists[0]?.searchParams ?? [])).toEqual({
      month: '2026-08',
      type: 'VARIABLE_EXPENSE',
      categoryId: FOOD,
      tag: 'viaje',
      q: 'pan',
    });
    expect(screen.getByLabelText('Buscar')).toHaveValue('pan');
  });

  it('moves between months through the URL, keeping them in the history', async () => {
    setup(() => page([]));

    await userEvent.click(await screen.findByRole('button', { name: 'Mes anterior' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/transactions?month=2026-08', {
      scroll: false,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/transactions?month=2026-10', {
      scroll: false,
    });
  });

  it('offers only the categories of the chosen type, marking the archived ones', async () => {
    navigation.search = 'show=VARIABLE_EXPENSE';
    setup(() => page([]));

    const select = await screen.findByLabelText('Categoría');
    await waitFor(() => {
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Todas', 'Comida', 'Cine (archivada)']);
    });
  });

  it('forgets the category when the type changes, and the tag when showing transfers', async () => {
    navigation.search = `categoryId=${FOOD}&tag=viaje`;
    setup(() => page([]));

    await userEvent.selectOptions(await screen.findByLabelText('Mostrar'), 'TRANSFER');

    expect(navigation.push).toHaveBeenLastCalledWith('/transactions?show=TRANSFER', {
      scroll: false,
    });
  });

  it('filters by a tag when it is tapped', async () => {
    setup(() => page([expense('a', '2026-09-28', 'Almuerzo', '25.90', ['viaje'])]));

    await userEvent.click(await screen.findByRole('button', { name: '#viaje' }));

    expect(navigation.push).toHaveBeenLastCalledWith('/transactions?tag=viaje', { scroll: false });
  });

  it('filters by category and tag from their selects, and can clear everything', async () => {
    navigation.search = 'show=INCOME';
    setup(() => page([]));

    // Las etiquetas llegan en su propia petición.
    await screen.findByRole('option', { name: 'viaje' });
    await userEvent.selectOptions(screen.getByLabelText('Etiqueta'), 'viaje');
    expect(navigation.push).toHaveBeenLastCalledWith('/transactions?show=INCOME&tag=viaje', {
      scroll: false,
    });

    await userEvent.selectOptions(screen.getByLabelText('Categoría'), SALARY);
    expect(navigation.push).toHaveBeenLastCalledWith(
      `/transactions?show=INCOME&categoryId=${SALARY}`,
      { scroll: false },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/transactions', { scroll: false });
  });

  it('searches once the person stops typing, replacing the history entry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setup(() => page([]));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

      await user.type(await screen.findByLabelText('Buscar'), 'pan');
      expect(navigation.replace).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });
      expect(navigation.replace).toHaveBeenCalledOnce();
      expect(navigation.replace).toHaveBeenCalledWith('/transactions?q=pan', { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets every loaded movement when the session ends', async () => {
    const { session, client } = setup(() => page([expense('a', '2026-09-28', 'Pan', '4.50')]));
    await screen.findByText('Pan');

    await act(() => session.logout());

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
