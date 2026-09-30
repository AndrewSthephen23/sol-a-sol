import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { UndoProvider } from '@/shared/feedback/undo-toast';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';
import { EditMovementScreen, NewMovementScreen } from '@/features/transactions/movement-editor';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}));

// 2026-09-28 en Lima. Corte 20: una compra de hoy va primero en el estado del 20 de octubre.
const CLOCK = FixedClock.at('2026-09-28T15:00:00Z');
const FOOD = '11111111-1111-4111-8111-111111111111';
const VISA = '22222222-2222-4222-8222-222222222222';
const AMEX = '33333333-3333-4333-8333-333333333333';
const BCP = '44444444-4444-4444-8444-444444444444';
const CARD = '55555555-5555-4555-8555-555555555555';
const TX = '66666666-6666-4666-8666-666666666666';
const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function method(id: string, alias: string, kind: string, currency: string | null) {
  return {
    id,
    alias,
    kind,
    institution: 'BCP',
    last4: kind === 'CREDIT_CARD' ? '4321' : null,
    currency,
    archivedAt: null,
    ...STAMPS,
  };
}

const VISA_STATUS = {
  id: CARD,
  paymentMethod: {
    id: VISA,
    alias: 'Visa',
    institution: 'BCP',
    last4: '4321',
    currency: 'PEN',
    archived: false,
  },
  creditLimit: { amount: '5000.00', currency: 'PEN' },
  statementDay: 20,
  paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
  openingBalance: null,
  status: {},
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Una API falsa: catálogo y tarjetas fijos; `answer` decide lo demás (o responde bien). */
function setup(
  ui: React.ReactElement,
  answer: (call: Call) => Response | undefined = () => undefined,
  plans: unknown[] = [],
) {
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
      calls.push(call);
      if (pathname === '/api/v1/categories') {
        return Response.json([
          {
            id: FOOD,
            name: 'Electrodomésticos',
            type: 'VARIABLE_EXPENSE',
            parentId: null,
            color: '#000000',
            icon: 'tag',
            archivedAt: null,
            children: [],
            ...STAMPS,
          },
        ]);
      }
      if (pathname === '/api/v1/payment-methods') {
        return Response.json([
          method(VISA, 'Visa', 'CREDIT_CARD', 'PEN'),
          method(AMEX, 'Amex', 'CREDIT_CARD', 'PEN'),
          method(BCP, 'Sueldo', 'ACCOUNT', 'PEN'),
        ]);
      }
      if (pathname === '/api/v1/credit-cards/status') return Response.json([VISA_STATUS]);
      if (pathname === `/api/v1/credit-cards/${CARD}/installments` && call.method === 'GET') {
        return Response.json(plans);
      }
      if (pathname === `/api/v1/transactions/${TX}` && call.method === 'GET') {
        return Response.json({
          kind: 'transaction',
          id: TX,
          date: '2026-09-10',
          type: 'VARIABLE_EXPENSE',
          categoryId: FOOD,
          amount: '600.00',
          currency: 'PEN',
          description: 'Televisor',
          paymentMethodId: VISA,
          merchant: null,
          source: 'MANUAL',
          captureId: null,
          tags: [],
          ...STAMPS,
        });
      }

      return (
        answer(call) ??
        Response.json(call.path === '/api/v1/transactions' ? { id: TX } : {}, {
          status: call.method === 'POST' ? 201 : 200,
        })
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

  return { calls };
}

async function fillPurchase(methodId: string, amount = '100') {
  const field = await screen.findByLabelText('Monto');
  if (amount !== '') await userEvent.type(field, amount);
  await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Electrodomésticos');
  await userEvent.selectOptions(screen.getByLabelText('Método de pago'), methodId);
}

describe('installments in the movement form', () => {
  beforeEach(() => {
    navigation.push.mockClear();
  });

  it('offers installments only with a configured card, and says why not with an unconfigured one', async () => {
    setup(<NewMovementScreen clock={CLOCK} cardsEnabled />);

    await fillPurchase(BCP);
    expect(screen.queryByLabelText('En cuotas')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), AMEX);
    expect(
      await screen.findByText(
        'Para pagarla en cuotas, primero configura esta tarjeta en Tarjetas.',
      ),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Método de pago'), VISA);
    expect(await screen.findByLabelText('En cuotas')).toBeInTheDocument();
  });

  it('asks nothing about cards while they are off', async () => {
    const { calls } = setup(<NewMovementScreen clock={CLOCK} />);

    await fillPurchase(VISA);
    expect(screen.queryByLabelText('En cuotas')).not.toBeInTheDocument();
    expect(calls.map((call) => call.path)).not.toContain('/api/v1/credit-cards/status');
  });

  it('shows the split before saving, and saves the purchase and then its plan', async () => {
    const { calls } = setup(<NewMovementScreen clock={CLOCK} cardsEnabled />);

    await fillPurchase(VISA, '');
    await userEvent.click(await screen.findByLabelText('En cuotas'));
    await userEvent.type(screen.getByLabelText('Número de cuotas'), '3');
    expect(
      screen.getByText('Completa el monto, la moneda y la fecha para ver el reparto.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Monto'), '100');

    expect(
      screen.getByText(
        '3 cuotas: 1 de S/ 33.34 y 2 de S/ 33.33. La primera va en el estado del 20 de octubre.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/transactions');
    });
    const writes = calls.filter((call) => call.method === 'POST');
    expect(writes.map((call) => call.path)).toEqual([
      '/api/v1/transactions',
      `/api/v1/credit-cards/${CARD}/installments`,
    ]);
    expect(writes[1]?.body).toEqual({ transactionId: TX, count: 3, totalAmount: null });
  });

  it('does not save anything with a wrong number of installments', async () => {
    const { calls } = setup(<NewMovementScreen clock={CLOCK} cardsEnabled />);

    await fillPurchase(VISA);
    await userEvent.click(await screen.findByLabelText('En cuotas'));
    await userEvent.type(screen.getByLabelText('Número de cuotas'), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByLabelText('Número de cuotas')).toHaveAccessibleDescription(
      'Las cuotas van de 2 a 36.',
    );
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('takes a saved purchase whose plan failed to its correction, with what was written', async () => {
    setup(<NewMovementScreen clock={CLOCK} cardsEnabled />, (call) =>
      call.path.endsWith('/installments')
        ? Response.json(
            { type: 'urn:sol-a-sol:error:installment-too-small', status: 422 },
            { status: 422 },
          )
        : undefined,
    );

    await fillPurchase(VISA);
    await userEvent.click(await screen.findByLabelText('En cuotas'));
    await userEvent.type(screen.getByLabelText('Número de cuotas'), '3');
    await userEvent.type(screen.getByLabelText('Total en cuotas'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(
        `/transactions/${TX}?cuotas=3&cuotasError=INSTALLMENT_TOO_SMALL&total=120`,
      );
    });
  });

  it('offers the installments again when correcting, saying why they were not saved', async () => {
    const { calls } = setup(
      <EditMovementScreen
        kind="transaction"
        id={TX}
        clock={CLOCK}
        cardsEnabled
        installmentsRetry={{ draft: { enabled: true, count: '6', total: '' }, code: null }}
      />,
    );

    expect(
      await screen.findByText(
        'La compra se guardó, pero sin cuotas: No se pudieron guardar las cuotas. Revisa las cuotas y guarda de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Número de cuotas')).toHaveValue('6');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalled();
    });
    expect(
      calls.filter((call) => call.method !== 'GET').map((call) => [call.method, call.path]),
    ).toEqual([
      ['PATCH', `/api/v1/transactions/${TX}`],
      ['POST', `/api/v1/credit-cards/${CARD}/installments`],
    ]);
  });

  it('says a purchase already in installments is undone from the card', async () => {
    setup(<EditMovementScreen kind="transaction" id={TX} clock={CLOCK} cardsEnabled />, undefined, [
      { id: 'plan-1', transactionId: TX, count: 6, state: 'ACTIVE' },
    ]);

    expect(
      await screen.findByText(
        'Se paga en 6 cuotas. Para cambiarlo, deshaz las cuotas desde Tarjetas.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('En cuotas')).not.toBeInTheDocument();
  });
});
