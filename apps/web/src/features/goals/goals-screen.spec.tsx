import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { UndoProvider } from '@/shared/feedback/undo-toast';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { GoalsScreen } from './goals-screen';

const CLOCK = FixedClock.at('2026-10-03T15:00:00Z');
const GOAL = '11111111-1111-4111-8111-111111111111';
const CONTRIBUTION = '22222222-2222-4222-8222-222222222222';
const SAVING = '33333333-3333-4333-8333-333333333333';

function goal(extra: { archived?: boolean; progress?: object } = {}) {
  return {
    id: GOAL,
    name: 'Viaje a Cusco',
    currency: 'PEN',
    targetAmount: '1200.00',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    archived: false,
    ...extra,
    progress: {
      saved: '300.00',
      remaining: '900.00',
      excess: '0.00',
      percentage: '25',
      expectedPercentage: '74.794520547945205479',
      behind: '597.53',
      suggestedMonthly: '300.00',
      status: 'AT_RISK',
      ...extra.progress,
    },
  };
}

const MANUAL = {
  id: CONTRIBUTION,
  source: 'MANUAL',
  kind: 'CONTRIBUTION',
  state: 'ACTIVE',
  amount: '300.00',
  date: '2026-09-15',
  transaction: null,
};

interface Sent {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

/** Una API falsa: las metas, sus aportes y lo que responde al guardar; cada petición se anota. */
function setup(
  options: {
    goals?: unknown[];
    contributions?: unknown[];
    onSave?: () => Response;
    /** Cuántas veces falla la lista antes de responder bien. */
    failures?: number;
  } = {},
) {
  const sent: Sent[] = [];
  let failures = options.failures ?? 0;
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const url = new URL(input.url);
      const body =
        input.method === 'GET' || input.method === 'DELETE'
          ? null
          : ((await input.json()) as unknown);
      sent.push({ method: input.method, path: url.pathname, query: url.search, body });
      if (input.method === 'GET' && url.pathname === '/api/v1/goals') {
        if (failures > 0) {
          failures -= 1;

          return Response.json({}, { status: 500 });
        }

        return Response.json(options.goals ?? []);
      }
      if (input.method === 'GET' && url.pathname.endsWith('/contributions')) {
        return Response.json(options.contributions ?? []);
      }
      if (input.method === 'GET' && url.pathname === '/api/v1/transactions') {
        const items =
          url.searchParams.get('type') === 'SAVING'
            ? [
                {
                  kind: 'transaction',
                  id: SAVING,
                  date: '2026-09-10',
                  description: 'Ahorro de setiembre',
                  amount: '500.00',
                  currency: 'PEN',
                },
              ]
            : [];

        return Response.json({ items, nextCursor: null, totals: [] });
      }
      if (input.method === 'DELETE') return new Response(null, { status: 204 });

      return options.onSave?.() ?? Response.json({}, { status: 201 });
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <UndoProvider>
          <GoalsScreen clock={CLOCK} />
        </UndoProvider>
      </QueryProvider>
    </SessionProvider>,
  );

  const writes = () => sent.filter((request) => request.method !== 'GET');

  return { sent, writes };
}

describe('GoalsScreen', () => {
  it('says there are no goals yet', async () => {
    setup();

    expect(await screen.findByText(/Todavía no tienes metas/u)).toBeInTheDocument();
  });

  it('shows how each goal goes, in words, not only in the bar', async () => {
    setup({ goals: [goal()] });

    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });
    expect(card).toHaveTextContent('Del 1 de enero de 2026 al 31 de diciembre de 2026');
    expect(card).toHaveTextContent('Llevas S/ 300.00 de S/ 1,200.00 (25.00 %)');
    expect(card).toHaveTextContent('Te faltan S/ 900.00');
    expect(card).toHaveTextContent('En riesgo: te faltan S/ 597.53 para ir al día');
    expect(card).toHaveTextContent('Aporta S/ 300.00 al mes para llegar a tiempo');
    expect(within(card).getByRole('progressbar')).toHaveAccessibleName(
      'Viaje a Cusco: Llevas S/ 300.00 de S/ 1,200.00 (25.00 %)',
    );
  });

  it('celebrates an achieved goal and says how far past the target it went', async () => {
    setup({
      goals: [
        goal({
          progress: {
            saved: '1500.00',
            remaining: '0.00',
            excess: '300.00',
            percentage: '125',
            suggestedMonthly: '0.00',
            status: 'ACHIEVED',
          },
        }),
      ],
    });

    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });
    expect(card).toHaveTextContent('¡Cumplida!');
    expect(card).toHaveTextContent('Superaste la meta por S/ 300.00');
    expect(card).not.toHaveTextContent('al mes');
  });

  it('offers to try again when the goals do not load', async () => {
    setup({ goals: [goal()], failures: 1 });

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article', { name: 'Viaje a Cusco' })).toBeInTheDocument();
  });

  it('asks for the archived goals only when shown', async () => {
    const { sent } = setup({ goals: [goal({ archived: true })] });
    await screen.findByRole('article');

    await userEvent.click(screen.getByLabelText('Ver archivadas'));

    await waitFor(() => {
      expect(sent.map((request) => request.query)).toContain('?includeArchived=true');
    });
    expect(sent[0]?.query).toBe('?includeArchived=false');
  });

  it('creates a goal, choosing its currency', async () => {
    const { writes } = setup();
    await screen.findByText(/Todavía no tienes metas/u);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva meta' }));
    const form = screen.getByRole('region', { name: 'Nueva meta' });
    await userEvent.type(within(form).getByLabelText('Nombre'), 'Laptop');
    await userEvent.selectOptions(within(form).getByLabelText('Moneda'), 'PEN');
    await userEvent.type(within(form).getByLabelText('Cuánto quieres juntar'), '3,000');
    await userEvent.type(within(form).getByLabelText('Hasta'), '2027-06-30');
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: '/api/v1/goals',
          query: '',
          body: {
            name: 'Laptop',
            currency: 'PEN',
            targetAmount: '3000.00',
            startDate: '2026-10-03',
            endDate: '2027-06-30',
          },
        },
      ]);
    });
    expect(screen.queryByRole('region', { name: 'Nueva meta' })).not.toBeInTheDocument();
  });

  it('puts an API error next to its field', async () => {
    setup({
      onSave: () =>
        Response.json(
          { type: 'urn:sol-a-sol:error:goal-name-taken', status: 409 },
          { status: 409 },
        ),
    });
    await screen.findByText(/Todavía no tienes metas/u);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva meta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Viaje a Cusco');
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'PEN');
    await userEvent.type(screen.getByLabelText('Cuánto quieres juntar'), '100');
    await userEvent.type(screen.getByLabelText('Hasta'), '2027-01-31');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const name = screen.getByLabelText('Nombre');
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(
        'Ya tienes una meta con ese nombre (quizá archivada).',
      );
    });
    expect(name).toHaveAttribute('aria-invalid', 'true');
  });

  it('corrects a goal without sending its currency', async () => {
    const { writes } = setup({ goals: [goal()] });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Corregir' }));
    expect(card).toHaveTextContent('Moneda: S/ (no se cambia)');
    const target = within(card).getByLabelText('Cuánto quieres juntar');
    await userEvent.clear(target);
    await userEvent.type(target, '1500');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'PATCH',
          path: `/api/v1/goals/${GOAL}`,
          query: '',
          body: {
            name: 'Viaje a Cusco',
            targetAmount: '1500.00',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
          },
        },
      ]);
    });
  });

  it('archives a goal, which then takes no contributions', async () => {
    const { writes } = setup({ goals: [goal({ archived: true })] });
    const card = await screen.findByRole('article', { name: /Viaje a Cusco/u });

    expect(within(card).queryByRole('button', { name: 'Aportar' })).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Desarchivar' }));

    await waitFor(() => {
      expect(writes()).toMatchObject([{ method: 'PATCH', body: { archived: false } }]);
    });
  });

  it('adds a contribution written by hand', async () => {
    const { writes } = setup({ goals: [goal()] });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Aportar' }));
    await userEvent.type(within(card).getByLabelText('Monto'), '250');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: `/api/v1/goals/${GOAL}/contributions`,
          query: '',
          body: { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '250.00', date: '2026-10-03' },
        },
      ]);
    });
  });

  it('says next to the amount when a withdrawal takes out more than was saved', async () => {
    setup({
      goals: [goal()],
      onSave: () =>
        Response.json(
          { type: 'urn:sol-a-sol:error:goal-withdrawal-exceeds-saved', status: 422 },
          { status: 422 },
        ),
    });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Aportar' }));
    await userEvent.click(within(card).getByLabelText('Retiro'));
    await userEvent.type(within(card).getByLabelText('Monto'), '500');
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(within(card).getByLabelText('Monto')).toHaveAccessibleDescription(
        'No puedes retirar más de lo que llevas ahorrado.',
      );
    });
  });

  it('links a saving transaction already registered', async () => {
    const { writes } = setup({ goals: [goal()] });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Aportar' }));
    await userEvent.click(within(card).getByLabelText('Una transacción de ahorro que ya registré'));
    const select = within(card).getByLabelText('Transacción');
    await within(select).findByRole('option', { name: /Ahorro de setiembre/u });
    await userEvent.selectOptions(select, SAVING);
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: `/api/v1/goals/${GOAL}/contributions`,
          query: '',
          body: { source: 'TRANSACTION', transactionId: SAVING },
        },
      ]);
    });
  });

  it('removes a contribution and offers to undo it', async () => {
    const { writes } = setup({ goals: [goal()], contributions: [MANUAL] });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Ver aportes' }));
    await userEvent.click(
      await within(card).findByRole('button', {
        name: 'Quitar: Aporte de S/ 300.00 el 15 de setiembre',
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));

    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'DELETE',
          path: `/api/v1/goals/${GOAL}/contributions/${CONTRIBUTION}`,
          query: '',
          body: null,
        },
        {
          method: 'POST',
          path: `/api/v1/goals/${GOAL}/contributions`,
          query: '',
          body: { source: 'MANUAL', kind: 'CONTRIBUTION', amount: '300.00', date: '2026-09-15' },
        },
      ]);
    });
  });

  it('says why a linked contribution no longer counts', async () => {
    setup({
      goals: [goal()],
      contributions: [
        {
          ...MANUAL,
          source: 'TRANSACTION',
          state: 'TRANSACTION_DELETED',
          amount: null,
          date: null,
        },
      ],
    });
    const card = await screen.findByRole('article', { name: 'Viaje a Cusco' });

    await userEvent.click(within(card).getByRole('button', { name: 'Ver aportes' }));

    expect(await within(card).findByText('No cuenta: la transacción se borró')).toBeVisible();
  });
});
