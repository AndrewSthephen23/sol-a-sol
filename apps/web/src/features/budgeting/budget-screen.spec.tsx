import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { BudgetScreen } from './budget-screen';

const navigation = vi.hoisted(() => ({ search: '', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
  usePathname: () => '/budgeting',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

// 28 de setiembre de 2026 en Lima.
const CLOCK = FixedClock.at('2026-09-28T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const SALARY = '22222222-2222-4222-8222-222222222222';
const CINEMA = '33333333-3333-4333-8333-333333333333';
const RENT = '44444444-4444-4444-8444-444444444444';
const GROCERIES = '55555555-5555-4555-8555-555555555555';

const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function category(id: string, name: string, type: string, extra: object = {}) {
  return {
    id,
    name,
    type,
    parentId: null,
    color: '#f59e0b',
    icon: 'tag',
    archivedAt: null,
    children: [],
    ...STAMPS,
    ...extra,
  };
}

const CATEGORIES = [
  category(FOOD, 'Comida', 'VARIABLE_EXPENSE', {
    children: [{ ...category(GROCERIES, 'Mercado', 'VARIABLE_EXPENSE'), parentId: FOOD }],
  }),
  category(RENT, 'Alquiler', 'FIXED_EXPENSE'),
  category(SALARY, 'Sueldo', 'INCOME'),
  category(CINEMA, 'Cine', 'VARIABLE_EXPENSE', { archivedAt: STAMPS.createdAt }),
];

const SEPTEMBER = {
  year: 2026,
  month: 9,
  lines: [
    { categoryId: FOOD, type: 'VARIABLE_EXPENSE', plannedAmount: '500.00', currency: 'PEN' },
    { categoryId: SALARY, type: 'INCOME', plannedAmount: '4000.00', currency: 'PEN' },
  ],
  summary: [
    {
      type: 'VARIABLE_EXPENSE',
      currency: 'PEN',
      lines: [
        {
          categoryId: FOOD,
          planned: '500.00',
          actual: '550.00',
          difference: '-50.00',
          executed: '110',
          status: 'EXCEEDED',
        },
      ],
      unbudgeted: [
        { categoryId: CINEMA, amount: '40.00' },
        { categoryId: RENT, amount: '10.50' },
      ],
      total: {
        planned: '500.00',
        actual: '600.50',
        difference: '-100.50',
        executed: '120.1',
        status: 'EXCEEDED',
      },
    },
    {
      type: 'INCOME',
      currency: 'PEN',
      lines: [
        {
          categoryId: SALARY,
          planned: '4000.00',
          actual: '1000.00',
          difference: '-3000.00',
          executed: '25',
          status: 'PENDING',
        },
      ],
      unbudgeted: [],
      total: {
        planned: '4000.00',
        actual: '1000.00',
        difference: '-3000.00',
        executed: '25',
        status: 'PENDING',
      },
    },
  ],
};

const EMPTY = { year: 2026, month: 9, lines: [], summary: [] };

type Handler = (request: Request) => Response | Promise<Response>;

/** Una API falsa: `budget` responde todo lo de `/budgets`, y cada petición queda anotada. */
function setup(budget: Handler) {
  const requests: Request[] = [];
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const url = new URL(input.url);
      if (url.pathname === '/api/v1/categories') return Response.json(CATEGORIES);
      requests.push(input.clone());

      return budget(input);
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <BudgetScreen clock={CLOCK} />
      </QueryProvider>
    </SessionProvider>,
  );

  return { requests };
}

/** Responde el mes guardado y, a un `PUT`, las mismas partidas que llegaron. */
function withStoredBudget(stored: object = EMPTY): Handler {
  return async (request) => {
    if (request.method !== 'PUT') return Response.json(stored);
    const { lines } = (await request.json()) as { lines: { categoryId: string }[] };

    return Response.json({
      ...EMPTY,
      lines: lines.map((line) => ({ ...line, type: 'VARIABLE_EXPENSE' })),
    });
  };
}

async function bodyOf(request: Request | undefined) {
  return request?.json() as Promise<unknown>;
}

const problem = (code: string, status = 422) =>
  Response.json(
    { type: `urn:sol-a-sol:error:${code}`, title: 'x', status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

describe('BudgetScreen', () => {
  beforeEach(() => {
    navigation.search = '';
    navigation.push.mockClear();
  });

  it('shows the current month in Lima, planned against actual, with what each line means', async () => {
    const { requests } = setup(withStoredBudget(SEPTEMBER));

    const spending = await screen.findByRole('region', { name: 'Gasto variable · Soles' });
    expect(spending).toHaveTextContent('ComidaS/ 550.00 de S/ 500.00');
    expect(spending).toHaveTextContent('Te pasaste S/ 50.00');
    expect(spending).toHaveTextContent('110.00 %');
    expect(
      within(spending).getByRole('progressbar', { name: 'Comida: 110.00 % ejecutado' }),
    ).toHaveValue(100);
    // Lo gastado sin partida suma aparte, con cada categoría adentro.
    expect(spending).toHaveTextContent('Sin presupuestoS/ 50.50');
    expect(spending).toHaveTextContent('Cine');

    const income = screen.getByRole('region', { name: 'Ingreso · Soles' });
    expect(income).toHaveTextContent('Faltan S/ 3,000.00');
    expect(income).toHaveTextContent('25.00 %');

    expect(screen.getByText('setiembre de 2026')).toBeInTheDocument();
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/v1/budgets/2026/9');
  });

  it('reads the month from the URL and moves between months with the navigator', async () => {
    navigation.search = 'month=2026-12';
    const { requests } = setup(withStoredBudget());

    await screen.findByText('No hay presupuesto para diciembre de 2026.');
    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api/v1/budgets/2026/12');

    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(navigation.push).toHaveBeenCalledWith('/budgeting?month=2027-01', { scroll: false });

    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/budgeting?month=2026-11', { scroll: false });
  });

  it('goes back to the plain address for the current month', async () => {
    navigation.search = 'month=2026-08';
    setup(withStoredBudget());

    await screen.findByText('No hay presupuesto para agosto de 2026.');
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(navigation.push).toHaveBeenCalledWith('/budgeting', { scroll: false });
  });

  it('builds a budget from nothing: only active parent categories, any currency', async () => {
    const { requests } = setup(withStoredBudget());

    await userEvent.click(await screen.findByRole('button', { name: 'Armar presupuesto' }));
    const select = screen.getByRole('combobox', { name: 'Categoría de la partida nueva' });
    // Ni la subcategoría «Mercado» ni la archivada «Cine».
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Elige una categoría', 'Comida', 'Alquiler', 'Sueldo']);

    await userEvent.selectOptions(select, FOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await userEvent.type(screen.getByLabelText('Comida (S/)'), '800');
    await userEvent.selectOptions(select, FOOD);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Moneda de la partida nueva' }),
      'USD',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await userEvent.type(screen.getByLabelText('Comida (US$)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByRole('button', { name: 'Editar' });
    const put = requests.find((request) => request.method === 'PUT');
    expect(new URL(put?.url ?? '').pathname).toBe('/api/v1/budgets/2026/9');
    await expect(bodyOf(put)).resolves.toEqual({
      lines: [
        { categoryId: FOOD, currency: 'PEN', plannedAmount: '800.00' },
        { categoryId: FOOD, currency: 'USD', plannedAmount: '0.00' },
      ],
    });
  });

  it('does not add a category twice in the same currency, nor without choosing one', async () => {
    setup(withStoredBudget(SEPTEMBER));

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige una categoría para agregar.');

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Categoría de la partida nueva' }),
      FOOD,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esa categoría ya tiene partida en esa moneda.',
    );
    expect(screen.getAllByLabelText('Comida (S/)')).toHaveLength(1);
  });

  it('marks a wrong amount and sends nothing', async () => {
    const { requests } = setup(withStoredBudget(SEPTEMBER));

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const food = screen.getByLabelText('Comida (S/)');
    await userEvent.clear(food);
    await userEvent.type(food, '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(food).toHaveAccessibleDescription(
      'Escribe el monto con punto decimal y hasta 2 decimales, como 800.00.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los montos marcados.');
    expect(requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('removes a line before saving', async () => {
    const { requests } = setup(withStoredBudget(SEPTEMBER));

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Sueldo en S/' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByRole('button', { name: 'Editar' });
    await expect(bodyOf(requests.find((request) => request.method === 'PUT'))).resolves.toEqual({
      lines: [{ categoryId: FOOD, currency: 'PEN', plannedAmount: '500.00' }],
    });
  });

  it('explains in Spanish why the API refused the budget, and stays in the editor', async () => {
    setup((request) =>
      request.method === 'PUT' ? problem('CATEGORY_ARCHIVED') : Response.json(SEPTEMBER),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Una de las categorías está archivada.',
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('says so when the connection fails while saving', async () => {
    setup((request) => {
      if (request.method === 'PUT') throw new TypeError('offline');

      return Response.json(SEPTEMBER);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar.');
  });

  it('cancels without sending anything', async () => {
    const { requests } = setup(withStoredBudget(SEPTEMBER));

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getByLabelText('Comida (S/)'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('region', { name: 'Gasto variable · Soles' })).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('copies the previous month and says from which, and what stayed out', async () => {
    const { requests } = setup((request) =>
      request.method === 'POST'
        ? Response.json({
            ...SEPTEMBER,
            copiedFrom: { year: 2026, month: 8 },
            skipped: [
              { categoryId: CINEMA, currency: 'PEN' },
              { categoryId: CINEMA, currency: 'USD' },
            ],
          })
        : Response.json(EMPTY),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar del mes anterior' }));

    expect(
      await screen.findByText(
        'Se copió de agosto de 2026. No se copiaron por estar archivadas: Cine.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gasto variable · Soles' })).toBeInTheDocument();
    const post = requests.find((request) => request.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toBe('/api/v1/budgets/2026/9/copy-from-previous');
  });

  it('says plainly when there is nothing to copy', async () => {
    setup((request) =>
      request.method === 'POST'
        ? Response.json({ ...EMPTY, copiedFrom: null, skipped: [] })
        : Response.json(EMPTY),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar del mes anterior' }));

    expect(
      await screen.findByText('No hay un mes anterior con presupuesto para copiar.'),
    ).toBeInTheDocument();
  });

  it('says so when the copy fails', async () => {
    setup((request) =>
      request.method === 'POST' ? problem('INTERNAL', 500) : Response.json(EMPTY),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar del mes anterior' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo copiar.');
  });

  it('sends the budget only once, however many times Guardar is pressed', async () => {
    let answer: (response: Response) => void = () => undefined;
    const { requests } = setup((request) =>
      request.method === 'PUT'
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : Response.json(SEPTEMBER),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const saving = screen.getByRole('button', { name: 'Guardando…' });
    expect(saving).toBeDisabled();
    await userEvent.click(saving);

    answer(Response.json(SEPTEMBER));
    await screen.findByRole('button', { name: 'Editar' });
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
  });

  it('shows «—» as executed for a line planned at zero, never Infinity', async () => {
    setup(() =>
      Response.json({
        ...EMPTY,
        lines: [
          { categoryId: RENT, type: 'FIXED_EXPENSE', plannedAmount: '0.00', currency: 'USD' },
        ],
        summary: [
          {
            type: 'FIXED_EXPENSE',
            currency: 'USD',
            lines: [
              {
                categoryId: RENT,
                planned: '0.00',
                actual: '0.00',
                difference: '0.00',
                executed: null,
                status: 'WITHIN',
              },
            ],
            unbudgeted: [],
            total: {
              planned: '0.00',
              actual: '0.00',
              difference: '0.00',
              executed: null,
              status: 'WITHIN',
            },
          },
        ],
      }),
    );

    const fixed = await screen.findByRole('region', { name: 'Gasto fijo · Dólares' });
    expect(fixed).toHaveTextContent('AlquilerUS$ 0.00 de US$ 0.00');
    expect(fixed).toHaveTextContent('—');
    expect(fixed).not.toHaveTextContent(/Infinity|NaN/u);
  });

  it('offers to retry when the budget does not load', async () => {
    let attempts = 0;
    setup(() => {
      attempts += 1;

      return attempts === 1 ? problem('INTERNAL', 500) : Response.json(SEPTEMBER);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Ingreso · Soles' })).toBeInTheDocument();
    });
  });
});
