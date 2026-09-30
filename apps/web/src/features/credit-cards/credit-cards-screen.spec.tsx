import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { CreditCardsScreen } from './credit-cards-screen';

const VISA = '11111111-1111-4111-8111-111111111111';
const AMEX = '22222222-2222-4222-8222-222222222222';
const CARD = '33333333-3333-4333-8333-333333333333';
const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };

function method(id: string, alias: string, currency: string | null, kind = 'CREDIT_CARD') {
  return {
    id,
    kind,
    alias,
    institution: 'BCP',
    last4: '4321',
    currency,
    archivedAt: null,
    ...STAMPS,
  };
}

function visaStatus(extra: { creditLimit?: object; status?: object } = {}) {
  return {
    id: CARD,
    paymentMethod: {
      id: VISA,
      alias: 'Visa',
      institution: 'BCP',
      last4: '4321',
      currency: null,
      archived: false,
    },
    creditLimit: { amount: '1000.00', currency: 'PEN' },
    statementDay: 20,
    paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    openingBalance: null,
    ...extra,
    status: {
      cycle: { start: '2026-09-21', end: '2026-10-20' },
      currencies: [
        { currency: 'PEN', debt: '245.00', cycleCharges: '200.00', pendingInstallments: '0.00' },
        { currency: 'USD', debt: '-5.00', cycleCharges: '30.00', pendingInstallments: '0.00' },
      ],
      statement: {
        start: '2026-08-21',
        end: '2026-09-20',
        dueDate: '2026-10-15',
        daysLeft: 16,
        paid: false,
        balances: [
          { currency: 'PEN', balance: '110.00', credited: '65.00', remaining: '45.00' },
          { currency: 'USD', balance: '0.00', credited: '0.00', remaining: '0.00' },
        ],
      },
      utilization: { percentage: '24.5', level: 'OK' },
      paymentAlert: null,
      ...extra.status,
    },
  };
}

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

/** Una API falsa: las tarjetas, los métodos y lo que responde al guardar; cada envío se anota. */
function setup(
  options: {
    cards?: unknown[];
    methods?: unknown[];
    onSave?: () => Response;
    /** Cuántas veces falla la lista antes de responder bien. */
    failures?: number;
    /** Las compras en cuotas de cada tarjeta. */
    plans?: unknown[];
  } = {},
) {
  const sent: Sent[] = [];
  let failures = options.failures ?? 0;
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const url = new URL(input.url);
      if (url.pathname === '/api/v1/credit-cards/status') {
        if (failures > 0) {
          failures -= 1;

          return Response.json({}, { status: 500 });
        }

        return Response.json(options.cards ?? []);
      }
      if (url.pathname.endsWith('/installments') && input.method === 'GET') {
        return Response.json(options.plans ?? []);
      }
      if (input.method === 'DELETE') {
        sent.push({ method: input.method, path: url.pathname, body: null });

        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/v1/payment-methods' && input.method === 'GET') {
        return Response.json(options.methods ?? []);
      }
      sent.push({ method: input.method, path: url.pathname, body: await input.json() });

      return options.onSave?.() ?? Response.json({}, { status: 201 });
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <CreditCardsScreen />
      </QueryProvider>
    </SessionProvider>,
  );

  return { sent };
}

describe('CreditCardsScreen', () => {
  it('says there are no cards yet', async () => {
    setup({ methods: [method(VISA, 'Sueldo', 'PEN', 'ACCOUNT')] });

    expect(await screen.findByText(/Todavía no tienes tarjetas de crédito/u)).toBeInTheDocument();
  });

  it('shows where a card stands, all in words', async () => {
    setup({ cards: [visaStatus()], methods: [method(VISA, 'Visa', null)] });

    const card = await screen.findByRole('article', { name: 'Visa BCP •••• 4321' });
    expect(card).toHaveAttribute('id', `tarjeta-${CARD}`);
    expect(card).toHaveTextContent('Del 21 de setiembre al 20 de octubre');
    expect(card).toHaveTextContent('Debes S/ 245.00 · Consumo del ciclo: S/ 200.00');
    // Bimoneda: cada moneda aparte, y un saldo a favor no se lee como deuda.
    expect(card).toHaveTextContent('Saldo a favor: US$ 5.00 · Consumo del ciclo: US$ 30.00');
    expect(card).toHaveTextContent('Usas el 24.50 % de tu línea de S/ 1,000.00');
    expect(within(card).getByRole('progressbar', { name: 'Uso de la línea' })).toHaveAttribute(
      'value',
      '24.5',
    );
    expect(card).toHaveTextContent('Fecha límite de pago: jueves, 15 de octubre (en 16 días)');
    expect(card).toHaveTextContent('Falta pagar S/ 45.00');
    expect(
      within(card).getByRole('link', { name: 'Ver movimientos de la tarjeta' }),
    ).toHaveAttribute('href', `/transactions?paymentMethodId=${VISA}`);
    expect(card).not.toHaveTextContent(/vencimiento|CVV/iu);
  });

  it.each([
    ['HIGH', '36.666666', 'Usas el 36.67 % de tu línea de S/ 1,000.00: uso alto'],
    ['CRITICAL', '82.5', 'Usas el 82.50 % de tu línea de S/ 1,000.00: uso crítico'],
  ])('writes a %s utilization in words, not only with the bar', async (level, percentage, text) => {
    setup({ cards: [visaStatus({ status: { utilization: { percentage, level } } })] });

    expect(await screen.findByRole('article', { name: /Visa/u })).toHaveTextContent(text);
  });

  it('has no percentage with a zero line', async () => {
    setup({
      cards: [
        visaStatus({
          creditLimit: { amount: '0.00', currency: 'PEN' },
          status: { utilization: { percentage: null, level: null } },
        }),
      ],
    });

    expect(await screen.findByRole('article', { name: /Visa/u })).toHaveTextContent(
      'Sin línea propia: no hay porcentaje de uso (—).',
    );
  });

  it('sets up a card that is not configured yet', async () => {
    const { sent } = setup({ methods: [method(AMEX, 'Amex', 'PEN')] });

    const card = await screen.findByRole('article', { name: 'Amex BCP •••• 4321' });
    await userEvent.click(within(card).getByRole('button', { name: 'Configura tu tarjeta' }));
    await userEvent.type(within(card).getByLabelText('Línea de crédito'), '3,000');
    await userEvent.type(within(card).getByLabelText('Día de corte'), '5');
    await userEvent.click(within(card).getByLabelText('Un día fijo del mes'));
    await userEvent.type(within(card).getByLabelText('Día del mes'), '28');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/v1/credit-cards',
        body: {
          paymentMethodId: AMEX,
          creditLimit: { amount: '3000.00', currency: 'PEN' },
          statementDay: 5,
          paymentDueRule: { kind: 'DAY_OF_MONTH', day: 28 },
          openingBalance: null,
        },
      },
    ]);
  });

  it('corrects a configured card, with an opening balance per currency', async () => {
    const { sent } = setup({ cards: [visaStatus()], methods: [method(VISA, 'Visa', null)] });

    const card = await screen.findByRole('article', { name: /Visa/u });
    await userEvent.click(within(card).getByRole('button', { name: 'Corregir' }));
    const day = within(card).getByLabelText('Día de corte');
    await userEvent.clear(day);
    await userEvent.type(day, '28');
    await userEvent.click(
      within(card).getByLabelText('Ya debía algo antes de registrar en la app'),
    );
    await userEvent.type(within(card).getByLabelText('Desde el día'), '2026-09-01');
    await userEvent.type(within(card).getByLabelText('Debía en US$'), '80');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    expect(sent).toEqual([
      {
        method: 'PATCH',
        path: `/api/v1/credit-cards/${CARD}`,
        body: {
          creditLimit: { amount: '1000.00', currency: 'PEN' },
          statementDay: 28,
          paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
          openingBalance: { date: '2026-09-01', amounts: [{ amount: '80.00', currency: 'USD' }] },
        },
      },
    ]);
  });

  it('marks a wrong field before sending anything', async () => {
    const { sent } = setup({ methods: [method(AMEX, 'Amex', 'PEN')] });

    const card = await screen.findByRole('article', { name: /Amex/u });
    await userEvent.click(within(card).getByRole('button', { name: 'Configura tu tarjeta' }));
    await userEvent.type(within(card).getByLabelText('Línea de crédito'), '100.005');
    await userEvent.type(within(card).getByLabelText('Día de corte'), '40');
    await userEvent.type(within(card).getByLabelText('Días después del corte'), '25');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    expect(within(card).getByLabelText('Día de corte')).toHaveAccessibleDescription(
      /El día de corte va del 1 al 31./u,
    );
    expect(within(card).getByLabelText('Línea de crédito')).toHaveAccessibleDescription(
      /2 decimales/u,
    );
    expect(sent).toEqual([]);
  });

  it('puts an API error next to its field, in Spanish', async () => {
    setup({
      methods: [method(AMEX, 'Amex', 'PEN')],
      onSave: () =>
        Response.json(
          { type: 'urn:sol-a-sol:error:opening-balance-date-in-future', status: 422 },
          { status: 422 },
        ),
    });

    const card = await screen.findByRole('article', { name: /Amex/u });
    await userEvent.click(within(card).getByRole('button', { name: 'Configura tu tarjeta' }));
    await userEvent.type(within(card).getByLabelText('Línea de crédito'), '3000');
    await userEvent.type(within(card).getByLabelText('Día de corte'), '5');
    await userEvent.type(within(card).getByLabelText('Días después del corte'), '25');
    await userEvent.click(
      within(card).getByLabelText('Ya debía algo antes de registrar en la app'),
    );
    await userEvent.type(within(card).getByLabelText('Desde el día'), '2030-01-01');
    await userEvent.type(within(card).getByLabelText('Debía en S/'), '10');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(card).findByText('La fecha del saldo inicial no puede ser posterior a hoy.'),
    ).toBeInTheDocument();
  });

  it('offers to retry when the cards do not load', async () => {
    setup({ cards: [visaStatus()], failures: 1 });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar tus tarjetas.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article', { name: /Visa/u })).toBeInTheDocument();
  });

  describe('purchases in installments', () => {
    const PLAN = {
      id: '44444444-4444-4444-8444-444444444444',
      transactionId: '55555555-5555-4555-8555-555555555555',
      count: 3,
      state: 'ACTIVE',
      purchase: {
        date: '2026-09-10',
        description: 'Televisor',
        amount: { amount: '1200.00', currency: 'PEN' },
      },
      total: { amount: '1260.00', currency: 'PEN' },
      interest: { amount: '60.00', currency: 'PEN' },
      installments: [
        {
          number: 1,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-09-20',
          billed: true,
        },
        {
          number: 2,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-10-20',
          billed: false,
        },
        {
          number: 3,
          amount: { amount: '420.00', currency: 'PEN' },
          statementDate: '2026-11-20',
          billed: false,
        },
      ],
      pending: { count: 2, amount: { amount: '840.00', currency: 'PEN' } },
    };

    it('lists them with what is left and the next statement', async () => {
      setup({ cards: [visaStatus()], plans: [PLAN] });

      const plans = await screen.findByRole('region', { name: 'Compras en cuotas' });
      expect(plans).toHaveTextContent('Televisor · 3 cuotas de S/ 1,260.00 en total');
      expect(plans).toHaveTextContent('1 de 3 cuotas facturadas');
      expect(plans).toHaveTextContent('Próxima cuota: S/ 420.00 en el estado del 20 de octubre');
      expect(plans).toHaveTextContent('Faltan S/ 840.00');
      expect(plans).toHaveTextContent('Intereses: S/ 60.00');
    });

    it('explains a plan whose purchase was deleted', async () => {
      setup({
        cards: [visaStatus()],
        plans: [
          {
            ...PLAN,
            state: 'PURCHASE_DELETED',
            purchase: null,
            total: null,
            interest: null,
            installments: [],
            pending: null,
          },
        ],
      });

      const plans = await screen.findByRole('region', { name: 'Compras en cuotas' });
      expect(plans).toHaveTextContent('Compra borrada');
      expect(plans).toHaveTextContent('sus cuotas no cuentan hasta que la restaures');
    });

    it('undoes a plan', async () => {
      const { sent } = setup({ cards: [visaStatus()], plans: [PLAN] });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Deshacer las cuotas de «Televisor»' }),
      );

      await waitFor(() => {
        expect(sent).toEqual([
          {
            method: 'DELETE',
            path: `/api/v1/credit-cards/${CARD}/installments/${PLAN.id}`,
            body: null,
          },
        ]);
      });
    });

    it('shows nothing about installments when there are none', async () => {
      setup({ cards: [visaStatus()] });

      await screen.findByRole('article', { name: /Visa/u });
      expect(screen.queryByRole('region', { name: 'Compras en cuotas' })).not.toBeInTheDocument();
    });
  });
});
