import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { UndoProvider } from '@/shared/feedback/undo-toast';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { lastPaymentMethod } from './form-options';
import { EditMovementScreen, listUrl, NewMovementScreen } from './movement-editor';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}));

const CLOCK = FixedClock.at('2026-09-28T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const SALARY = '22222222-2222-4222-8222-222222222222';
const BCP = '33333333-3333-4333-8333-333333333333';
const DOLLARS = '44444444-4444-4444-8444-444444444444';
const WALLET = '55555555-5555-4555-8555-555555555555';
const TX = '66666666-6666-4666-8666-666666666666';
const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function category(id: string, name: string, type: string) {
  return {
    id,
    name,
    type,
    parentId: null,
    color: '#000000',
    icon: 'tag',
    archivedAt: null,
    children: [],
    ...STAMPS,
  };
}

function method(id: string, alias: string, currency: string | null) {
  return {
    id,
    alias,
    kind: 'ACCOUNT',
    institution: null,
    last4: null,
    currency,
    archivedAt: null,
    ...STAMPS,
  };
}

const TRANSACTION = {
  kind: 'transaction',
  id: TX,
  date: '2026-08-15',
  type: 'VARIABLE_EXPENSE',
  categoryId: FOOD,
  amount: '25.90',
  currency: 'PEN',
  description: 'Almuerzo',
  paymentMethodId: BCP,
  merchant: 'Tambo',
  source: 'MANUAL',
  captureId: null,
  tags: ['viaje'],
  ...STAMPS,
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Answer = (call: Call) => Response | Promise<Response> | undefined;

/** Una API falsa: catálogo fijo; lo demás lo decide `answer` (o 200 `{}` si no dice nada). */
function setup(ui: React.ReactElement, answer: Answer = () => undefined) {
  const calls: Call[] = [];
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const { pathname } = new URL(input.url);
      const text = await input.text();
      const call = {
        method: input.method,
        path: pathname,
        body: text === '' ? null : (JSON.parse(text) as unknown),
      };
      if (pathname === '/api/v1/categories') {
        return Response.json([
          category(FOOD, 'Comida', 'VARIABLE_EXPENSE'),
          category(SALARY, 'Sueldo', 'INCOME'),
        ]);
      }
      if (pathname === '/api/v1/payment-methods') {
        return Response.json([
          method(BCP, 'BCP', 'PEN'),
          method(DOLLARS, 'BCP Dólares', 'USD'),
          method(WALLET, 'Billetera', null),
        ]);
      }
      calls.push(call);

      return (
        (await answer(call)) ?? Response.json({}, { status: call.method === 'POST' ? 201 : 200 })
      );
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <UndoProvider>{ui}</UndoProvider>
      </QueryProvider>
    </SessionProvider>,
  );

  return { calls, user: userEvent.setup() };
}

function problem(status: number, code: string): Response {
  return Response.json(
    { type: `urn:sol-a-sol:error:${code}`, title: 'Unprocessable', status, detail: 'English.' },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

describe('NewMovementScreen', () => {
  beforeEach(() => {
    navigation.push.mockClear();
    globalThis.localStorage.clear();
  });

  it('registers an expense with the amount as text and the type of the category', async () => {
    const { calls, user } = setup(<NewMovementScreen clock={CLOCK} />);

    await user.type(await screen.findByLabelText('Monto'), '1,234.5');
    await user.selectOptions(screen.getByLabelText('Categoría'), FOOD);
    await user.selectOptions(screen.getByLabelText('Método de pago'), BCP);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/transactions');
    });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/transactions',
        body: {
          date: '2026-09-28',
          type: 'VARIABLE_EXPENSE',
          categoryId: FOOD,
          amount: '1234.50',
          currency: 'PEN',
          description: 'Comida',
          paymentMethodId: BCP,
          merchant: null,
          tags: [],
        },
      },
    ]);
    expect(lastPaymentMethod.read()).toBe(BCP);
  });

  it('opens the numeric keyboard for the amount', async () => {
    setup(<NewMovementScreen clock={CLOCK} />);

    expect(await screen.findByLabelText('Monto')).toHaveAttribute('inputmode', 'decimal');
  });

  it('checks amount and category before calling the API, next to each field', async () => {
    const { calls, user } = setup(<NewMovementScreen clock={CLOCK} />);

    await user.type(await screen.findByLabelText('Monto'), '25.905');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const amount = screen.getByLabelText('Monto');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(
      'Escribe el monto con punto decimal y hasta 2 decimales, como 25.90.',
    );
    expect(screen.getByLabelText('Categoría')).toHaveAccessibleDescription('Elige una categoría.');
    expect(calls).toEqual([]);
  });

  it('asks for the currency only when the method does not fix it, with nothing chosen', async () => {
    const { user } = setup(<NewMovementScreen clock={CLOCK} />);

    const methodSelect = await screen.findByLabelText('Método de pago');
    expect(screen.getByLabelText('Moneda')).toHaveValue('');
    await user.selectOptions(methodSelect, BCP);
    expect(screen.queryByLabelText('Moneda')).not.toBeInTheDocument();
    await user.selectOptions(methodSelect, WALLET);
    expect(screen.getByLabelText('Moneda')).toHaveValue('');
  });

  it('starts with the last payment method used in this browser', async () => {
    lastPaymentMethod.write(DOLLARS);
    setup(<NewMovementScreen clock={CLOCK} />);

    expect(await screen.findByLabelText('Método de pago')).toHaveValue(DOLLARS);
  });

  it('cannot be sent twice while it is saving', async () => {
    let answer: (response: Response) => void = () => undefined;
    const { calls, user } = setup(
      <NewMovementScreen clock={CLOCK} />,
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );

    await user.type(await screen.findByLabelText('Monto'), '10');
    await user.selectOptions(screen.getByLabelText('Categoría'), SALARY);
    await user.selectOptions(screen.getByLabelText('Método de pago'), BCP);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const saving = screen.getByRole('button', { name: 'Guardando…' });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ type: 'INCOME', categoryId: SALARY });
    answer(Response.json({}, { status: 201 }));
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledOnce();
    });
  });

  it('puts an API error next to its field, in Spanish', async () => {
    const { user } = setup(<NewMovementScreen clock={CLOCK} />, () =>
      problem(422, 'category-archived'),
    );

    await user.type(await screen.findByLabelText('Monto'), '10');
    await user.selectOptions(screen.getByLabelText('Categoría'), FOOD);
    await user.selectOptions(screen.getByLabelText('Método de pago'), BCP);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Categoría')).toHaveAccessibleDescription(
        'Esa categoría está archivada.',
      );
    });
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('shows an unknown API error or a network failure above the button', async () => {
    let fail: 'unknown' | 'network' = 'unknown';
    const { user } = setup(<NewMovementScreen clock={CLOCK} />, () =>
      fail === 'unknown' ? problem(409, 'something-new') : Promise.reject(new TypeError('offline')),
    );

    await user.type(await screen.findByLabelText('Monto'), '10');
    await user.selectOptions(screen.getByLabelText('Categoría'), FOOD);
    await user.selectOptions(screen.getByLabelText('Método de pago'), BCP);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal.');

    fail = 'network';
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar.');
    });
  });

  it('registers a transfer, asking what arrived when the currency changes', async () => {
    const { calls, user } = setup(<NewMovementScreen clock={CLOCK} />);

    await user.click(await screen.findByRole('radio', { name: 'Transferencia' }));
    await user.type(screen.getByLabelText('Monto'), '100');
    await user.selectOptions(screen.getByLabelText('Desde'), BCP);
    await user.selectOptions(screen.getByLabelText('Hacia'), DOLLARS);
    expect(screen.getByLabelText('Monto enviado (soles)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Monto recibido (dólares)')).toHaveAccessibleDescription(
      'Cópialo del voucher: el tipo de cambio nunca se calcula. Escribe cuánto llegó: la moneda cambia y nunca se convierte.',
    );

    await user.type(screen.getByLabelText('Monto recibido (dólares)'), '26.95');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/v1/transfers',
      body: {
        date: '2026-09-28',
        fromPaymentMethodId: BCP,
        toPaymentMethodId: DOLLARS,
        amount: '100.00',
        currency: 'PEN',
        receivedAmount: '26.95',
        receivedCurrency: 'USD',
        description: 'Transferencia BCP → BCP Dólares',
      },
    });
  });

  it('asks for the currency of a transfer from an account that takes both', async () => {
    const { calls, user } = setup(<NewMovementScreen clock={CLOCK} />, (call) =>
      call.path === '/api/v1/transfers' ? problem(422, 'transfer-same-account') : undefined,
    );

    await user.click(await screen.findByRole('radio', { name: 'Transferencia' }));
    await user.type(screen.getByLabelText('Monto'), '50');
    await user.selectOptions(screen.getByLabelText('Desde'), WALLET);
    await user.selectOptions(screen.getByLabelText('Hacia'), BCP);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Moneda')).toHaveAccessibleDescription('Elige la moneda.');

    await user.selectOptions(screen.getByLabelText('Moneda'), 'PEN');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Hacia')).toHaveAccessibleDescription(
        'Elige una cuenta distinta a la de origen.',
      );
    });
    expect(calls[0]?.body).toMatchObject({ currency: 'PEN', receivedCurrency: 'PEN' });
  });
});

describe('EditMovementScreen', () => {
  beforeEach(() => {
    navigation.push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('corrects a transaction of a past month and goes back to that month', async () => {
    const { calls, user } = setup(
      <EditMovementScreen kind="transaction" id={TX} clock={CLOCK} />,
      (call) => (call.method === 'GET' ? Response.json(TRANSACTION) : undefined),
    );

    const amount = await screen.findByLabelText('Monto');
    expect(amount).toHaveValue('25.90');
    expect(screen.getByLabelText('Etiquetas')).toHaveValue('viaje');
    await user.clear(amount);
    await user.type(amount, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/transactions?month=2026-08');
    });
    expect(calls.at(-1)).toEqual({
      method: 'PATCH',
      path: `/api/v1/transactions/${TX}`,
      body: expect.objectContaining({
        amount: '30.00',
        description: 'Almuerzo',
        merchant: 'Tambo',
        tags: ['viaje'],
      }) as unknown,
    });
  });

  it('deletes and offers to undo, restoring when asked', async () => {
    const { calls, user } = setup(
      <EditMovementScreen kind="transaction" id={TX} clock={CLOCK} />,
      (call) => {
        if (call.method === 'GET') return Response.json(TRANSACTION);
        if (call.method === 'DELETE') return new Response(null, { status: 204 });

        return Response.json(TRANSACTION);
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Borrar' }));
    expect(await screen.findByText('Movimiento borrado.')).toBeInTheDocument();
    expect(navigation.push).toHaveBeenCalledWith('/transactions?month=2026-08');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Listo, se deshizo.')).toBeInTheDocument();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toContain(
      `POST /api/v1/transactions/${TX}/restore`,
    );
  });

  it('says so when the delete fails, and stays', async () => {
    const { user } = setup(
      <EditMovementScreen kind="transaction" id={TX} clock={CLOCK} />,
      (call) =>
        call.method === 'GET' ? Response.json(TRANSACTION) : new Response(null, { status: 500 }),
    );

    await user.click(await screen.findByRole('button', { name: 'Borrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo borrar.');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('corrects a transfer, keeping what arrived in another currency', async () => {
    const transfer = {
      kind: 'transfer',
      id: TX,
      date: '2026-09-20',
      fromPaymentMethodId: BCP,
      toPaymentMethodId: DOLLARS,
      amount: '100.00',
      currency: 'PEN',
      receivedAmount: '26.95',
      receivedCurrency: 'USD',
      description: 'Cambio',
      source: 'MANUAL',
      ...STAMPS,
    };
    const { calls, user } = setup(
      <EditMovementScreen kind="transfer" id={TX} clock={CLOCK} />,
      (call) => (call.method === 'GET' ? Response.json(transfer) : Response.json(transfer)),
    );

    expect(await screen.findByLabelText('Monto recibido (dólares)')).toHaveValue('26.95');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/transactions');
    });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: `/api/v1/transfers/${TX}` });
  });

  it('says the movement does not exist', async () => {
    setup(<EditMovementScreen kind="transfer" id={TX} clock={CLOCK} />, () =>
      problem(404, 'transfer-not-found'),
    );

    expect(await screen.findByText('Este movimiento no existe o ya se borró.')).toBeInTheDocument();
  });

  it('says it could not load the movement', async () => {
    setup(
      <EditMovementScreen kind="transaction" id={TX} clock={CLOCK} />,
      () => new Response(null, { status: 500 }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el movimiento.');
  });

  it('shows it is loading meanwhile', () => {
    setup(<EditMovementScreen kind="transaction" id={TX} clock={CLOCK} />);

    expect(within(screen.getByRole('main')).getByText('Cargando…')).toBeInTheDocument();
  });
});

describe('listUrl', () => {
  it('goes to the plain list for this month, and to the month of an older date', () => {
    expect(listUrl('2026-09-01', CLOCK)).toBe('/transactions');
    expect(listUrl('2025-12-31', CLOCK)).toBe('/transactions?month=2025-12');
  });
});
