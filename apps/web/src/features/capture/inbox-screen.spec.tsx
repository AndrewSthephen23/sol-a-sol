import { FixedClock } from '@sol-a-sol/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { UndoProvider } from '@/shared/feedback/undo-toast';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { InboxScreen } from './inbox-screen';

const CLOCK = FixedClock.at('2026-10-04T15:00:00Z');
const TAMBO = '11111111-1111-4111-8111-111111111111';
const WONG = '22222222-2222-4222-8222-222222222222';
const GROCERIES = '33333333-3333-4333-8333-333333333333';
const FEES = '44444444-4444-4444-8444-444444444444';
const VISA = '55555555-5555-4555-8555-555555555555';

function capture(id: string, extra: object = {}) {
  return {
    id,
    source: 'ANDROID_AUTOMATION',
    status: 'PENDING',
    parsed: true,
    type: 'VARIABLE_EXPENSE',
    amount: '25.90',
    currency: 'PEN',
    merchant: 'Tambo',
    cardLast4: '4242',
    date: '2026-10-03',
    occurredAt: '2026-10-03T16:30:00.000Z',
    categoryId: GROCERIES,
    paymentMethodId: null,
    description: null,
    warnings: [],
    raw: { rawText: 'Compra en TAMBO por S/ 25.90' },
    discardedAt: null,
    transactionId: null,
    ...extra,
  };
}

const CATEGORIES = [
  {
    id: GROCERIES,
    name: 'Víveres',
    type: 'VARIABLE_EXPENSE',
    parentId: null,
    color: '#E53935',
    icon: 'cart',
    archivedAt: null,
    children: [],
  },
  {
    id: FEES,
    name: 'Honorarios',
    type: 'INCOME',
    parentId: null,
    color: '#43A047',
    icon: 'briefcase',
    archivedAt: null,
    children: [],
  },
];

const METHODS = [
  {
    id: VISA,
    kind: 'CREDIT_CARD',
    alias: 'Visa BCP',
    institution: 'BCP',
    last4: '4242',
    currency: 'PEN',
    archivedAt: null,
  },
];

interface Sent {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

/** Una API falsa: la bandeja, el catálogo y lo que responde a cada acción; todo se anota. */
function setup(
  options: {
    inbox?: unknown[];
    discarded?: unknown[];
    rules?: unknown[];
    respond?: (sent: Sent) => Response | undefined;
    failures?: number;
  } = {},
) {
  const sent: Sent[] = [];
  let failures = options.failures ?? 0;
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const url = new URL(input.url);
      const text = input.method === 'GET' ? '' : await input.text();
      const request: Sent = {
        method: input.method,
        path: url.pathname,
        query: url.search,
        body: text === '' ? null : (JSON.parse(text) as unknown),
      };
      sent.push(request);
      const custom = options.respond?.(request);
      if (custom !== undefined) return custom;
      if (input.method === 'GET' && url.pathname === '/api/v1/captures') {
        if (failures > 0) {
          failures -= 1;
          return Response.json({}, { status: 500 });
        }
        const items =
          url.searchParams.get('status') === 'discarded'
            ? (options.discarded ?? [])
            : (options.inbox ?? []);
        return Response.json({ items, nextCursor: null });
      }
      if (url.pathname === '/api/v1/categories') return Response.json(CATEGORIES);
      if (input.method === 'GET' && url.pathname === '/api/v1/categorization-rules') {
        return Response.json(options.rules ?? []);
      }
      if (input.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v1/payment-methods') return Response.json(METHODS);
      if (url.pathname === '/api/v1/captures/confirm') {
        return Response.json({ confirmed: [], failed: [] });
      }

      return Response.json(capture(TAMBO));
    },
  });
  session.signIn('token');

  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <UndoProvider>
          <InboxScreen clock={CLOCK} />
        </UndoProvider>
      </QueryProvider>
    </SessionProvider>,
  );

  return { sent, user: userEvent.setup() };
}

function actions(sent: readonly Sent[]) {
  return sent
    .filter(({ method }) => method !== 'GET')
    .map(({ method, path, body }) => ({
      method,
      path,
      body,
    }));
}

function problem(code: string, status: number): Response {
  return Response.json(
    { type: `urn:sol-a-sol:error:${code.toLowerCase().replaceAll('_', '-')}`, status },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

describe('InboxScreen', () => {
  beforeAll(() => {
    // jsdom no desplaza nada: la regla resaltada solo necesita que exista.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('says so while it loads and when there is nothing to review', async () => {
    setup();

    expect(screen.getByText('Cargando la bandeja…')).toBeInTheDocument();
    expect(await screen.findByText('No hay nada por revisar.')).toBeInTheDocument();
  });

  it('offers to try again when the inbox cannot be loaded', async () => {
    const { user } = setup({ inbox: [capture(TAMBO)], failures: 1 });

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Víveres')).toBeInTheDocument();
  });

  it('shows what arrived: amount, merchant, card, category, warnings and the raw text', async () => {
    setup({
      inbox: [capture(TAMBO, { warnings: ['UNKNOWN_SOURCE'], status: 'DUPLICATE' })],
    });

    const card = await screen.findByRole('article', { name: 'S/ 25.90 Tambo' });
    expect(within(card).getByText('Tambo · 2026-10-03 · ···· 4242')).toBeInTheDocument();
    expect(within(card).getByText('Víveres')).toBeInTheDocument();
    expect(within(card).getByText('Posible duplicado')).toBeInTheDocument();
    expect(
      within(card).getByText('No se reconoció el banco: solo se leyó el monto.'),
    ).toBeInTheDocument();
    expect(within(card).getByText('Compra en TAMBO por S/ 25.90')).toBeInTheDocument();
  });

  it('confirms a complete capture with one tap', async () => {
    const { sent, user } = setup({ inbox: [capture(TAMBO)] });

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(actions(sent)).toEqual([
        {
          method: 'POST',
          path: `/api/v1/captures/${TAMBO}/confirm`,
          body: { rememberCategory: false },
        },
      ]);
    });
  });

  it('remembers the category for the merchant when the box is ticked (decision 13)', async () => {
    const { sent, user } = setup({ inbox: [capture(TAMBO)] });

    await user.click(await screen.findByLabelText('Recordar la categoría para «Tambo»'));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(actions(sent)[0]?.body).toEqual({ rememberCategory: true });
    });
  });

  it('does not offer to confirm one without an amount, and says what is missing', async () => {
    setup({
      inbox: [capture(TAMBO, { amount: null, currency: null, parsed: false, categoryId: null })],
    });

    const card = await screen.findByRole('article', { name: 'Sin monto Tambo' });
    expect(within(card).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(within(card).getByText('Faltan el monto y la categoría.')).toBeInTheDocument();
    expect(within(card).queryByLabelText(/Recordar/u)).not.toBeInTheDocument();
  });

  it('says why a confirmation was refused', async () => {
    const { user } = setup({
      inbox: [capture(TAMBO)],
      respond: ({ path }) =>
        path.endsWith('/confirm') ? problem('CAPTURE_NOT_PENDING', 409) : undefined,
    });

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya se confirmó o se descartó, quizá desde otra pestaña.',
    );
  });

  it('corrects a capture in its card, and the type follows the category', async () => {
    const { sent, user } = setup({ inbox: [capture(TAMBO)] });

    await user.click(await screen.findByRole('button', { name: 'Corregir' }));
    await user.clear(screen.getByLabelText('Monto'));
    await user.type(screen.getByLabelText('Monto'), '30');
    await user.selectOptions(screen.getByLabelText('Categoría'), FEES);
    await user.selectOptions(screen.getByLabelText('Método de pago'), VISA);
    await user.type(screen.getByLabelText('Descripción'), 'Pago');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(actions(sent)).toEqual([
        {
          method: 'PATCH',
          path: `/api/v1/captures/${TAMBO}`,
          body: {
            amount: '30.00',
            currency: 'PEN',
            date: '2026-10-03',
            categoryId: FEES,
            type: 'INCOME',
            paymentMethodId: VISA,
            merchant: 'Tambo',
            description: 'Pago',
          },
        },
      ]);
    });
    expect(screen.queryByLabelText('Monto')).not.toBeInTheDocument();
  });

  it('puts an error of the API next to its field', async () => {
    const { user } = setup({
      inbox: [capture(TAMBO)],
      respond: ({ method }) => (method === 'PATCH' ? problem('CATEGORY_ARCHIVED', 422) : undefined),
    });

    await user.click(await screen.findByRole('button', { name: 'Corregir' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByLabelText('Categoría')).toHaveAccessibleDescription(
      'Esa categoría está archivada.',
    );
  });

  it('checks the amount before sending anything', async () => {
    const { sent, user } = setup({ inbox: [capture(TAMBO)] });

    await user.click(await screen.findByRole('button', { name: 'Corregir' }));
    await user.clear(screen.getByLabelText('Monto'));
    await user.type(screen.getByLabelText('Monto'), '25.905');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByLabelText('Monto')).toHaveAccessibleDescription(
      'Escribe el monto con punto decimal y hasta 2 decimales, como 25.90.',
    );
    expect(actions(sent)).toEqual([]);
  });

  it('discards a capture and undoes it (decision 11)', async () => {
    const { sent, user } = setup({ inbox: [capture(TAMBO)] });

    await user.click(await screen.findByRole('button', { name: 'Descartar' }));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));

    await waitFor(() => {
      expect(actions(sent).map(({ path }) => path)).toEqual([
        `/api/v1/captures/${TAMBO}/discard`,
        `/api/v1/captures/${TAMBO}/restore`,
      ]);
    });
    expect(await screen.findByText('Listo, se deshizo.')).toBeInTheDocument();
  });

  it('confirms every complete one at once, and says how many could not', async () => {
    const { sent, user } = setup({
      inbox: [
        capture(TAMBO),
        capture(WONG, { merchant: 'Wong' }),
        capture('66666666-6666-4666-8666-666666666666', { categoryId: null }),
      ],
      respond: ({ path }) =>
        path === '/api/v1/captures/confirm'
          ? Response.json({
              confirmed: [{ id: TAMBO, transactionId: VISA }],
              failed: [{ id: WONG, code: 'CATEGORY_ARCHIVED' }],
            })
          : undefined,
    });

    await user.click(await screen.findByRole('button', { name: 'Confirmar las 2 completas' }));

    await waitFor(() => {
      expect(actions(sent)).toEqual([
        {
          method: 'POST',
          path: '/api/v1/captures/confirm',
          body: {
            captures: [
              { id: TAMBO, rememberCategory: false },
              { id: WONG, rememberCategory: false },
            ],
          },
        },
      ]);
    });
    expect(await screen.findByText('1 no se pudo confirmar: revísalas.')).toBeInTheDocument();
  });

  it('shows the discarded ones in their tab and restores one', async () => {
    const { sent, user } = setup({
      discarded: [
        capture(WONG, {
          merchant: 'Wong',
          status: 'DISCARDED',
          discardedAt: '2026-10-04T10:00:00.000Z',
        }),
      ],
    });

    await user.click(await screen.findByRole('tab', { name: 'Descartadas' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));

    await waitFor(() => {
      expect(actions(sent).map(({ path }) => path)).toEqual([`/api/v1/captures/${WONG}/restore`]);
    });
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
  });

  it('asks for the inbox again when coming back to its tab: captures arrive meanwhile', async () => {
    const { sent, user } = setup();
    await screen.findByText('No hay nada por revisar.');
    const before = sent.filter(({ path }) => path === '/api/v1/captures').length;

    await user.click(screen.getByRole('tab', { name: 'Reglas' }));
    await user.click(screen.getByRole('tab', { name: 'Por revisar' }));

    await waitFor(() => {
      expect(sent.filter(({ path }) => path === '/api/v1/captures').length).toBeGreaterThan(before);
    });
  });

  it('says so when no capture was discarded', async () => {
    const { user } = setup();

    await user.click(await screen.findByRole('tab', { name: 'Descartadas' }));

    expect(await screen.findByText('No hay capturas descartadas.')).toBeInTheDocument();
  });

  describe('rules (decided 2026-10-04)', () => {
    const RULE = {
      id: '77777777-7777-4777-8777-777777777777',
      pattern: 'Tambo',
      categoryId: GROCERIES,
      priority: 2,
    };

    it('says which rule gave a capture its category, and shows it in the rules tab', async () => {
      const { user } = setup({ inbox: [capture(TAMBO)], rules: [RULE] });

      await user.click(
        await screen.findByRole('button', { name: 'Coincide con la regla «Tambo»' }),
      );

      expect(screen.getByRole('tab', { name: 'Reglas' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('listitem', { name: 'Regla «Tambo»' })).toHaveClass('ring-2');
    });

    it('says nothing when the category was chosen by hand', async () => {
      setup({ inbox: [capture(TAMBO, { categoryId: FEES, type: 'INCOME' })], rules: [RULE] });

      await screen.findByText('Honorarios');
      expect(
        screen.queryByRole('button', { name: /Coincide con la regla/u }),
      ).not.toBeInTheDocument();
    });

    it('lists the rules, and says so when there are none', async () => {
      const { user } = setup({ rules: [RULE] });

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));

      const item = screen.getByRole('listitem', { name: 'Regla «Tambo»' });
      expect(item).toHaveTextContent('Si el comercio contiene «Tambo» → Víveres');
      expect(item).toHaveTextContent('Prioridad 2');
    });

    it('says so when there are no rules', async () => {
      const { user } = setup();

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));

      expect(await screen.findByText('Todavía no tienes reglas.')).toBeInTheDocument();
    });

    it('creates a rule', async () => {
      const { sent, user } = setup();

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));
      await user.click(await screen.findByRole('button', { name: 'Nueva regla' }));
      await user.type(screen.getByLabelText('Si el comercio contiene'), ' Tambo ');
      await user.selectOptions(screen.getByLabelText('Categoría'), GROCERIES);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(actions(sent)).toEqual([
          {
            method: 'POST',
            path: '/api/v1/categorization-rules',
            body: { pattern: 'Tambo', categoryId: GROCERIES, priority: 0 },
          },
        ]);
      });
    });

    it('corrects a rule, and puts a repeated pattern next to its field', async () => {
      const { sent, user } = setup({
        rules: [RULE],
        respond: ({ method }) =>
          method === 'PATCH' ? problem('RULE_PATTERN_TAKEN', 409) : undefined,
      });

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));
      await user.click(await screen.findByRole('button', { name: 'Corregir' }));
      await user.clear(screen.getByLabelText('Prioridad'));
      await user.type(screen.getByLabelText('Prioridad'), '5');
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByLabelText('Si el comercio contiene')).toHaveAccessibleDescription(
        /Ya tienes una regla para ese texto: corrige esa\./u,
      );
      expect(actions(sent)[0]).toEqual({
        method: 'PATCH',
        path: `/api/v1/categorization-rules/${RULE.id}`,
        body: { pattern: 'Tambo', categoryId: GROCERIES, priority: 5 },
      });
    });

    it('checks the priority before sending anything', async () => {
      const { sent, user } = setup({ rules: [RULE] });

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));
      await user.click(await screen.findByRole('button', { name: 'Corregir' }));
      await user.clear(screen.getByLabelText('Prioridad'));
      await user.type(screen.getByLabelText('Prioridad'), '-1');
      await user.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByLabelText('Prioridad')).toHaveAccessibleDescription(
        /La prioridad es un número entero, 0 o más\./u,
      );
      expect(actions(sent)).toEqual([]);
    });

    it('asks before deleting a rule, and deletes it', async () => {
      const { sent, user } = setup({ rules: [RULE] });

      await user.click(await screen.findByRole('tab', { name: 'Reglas' }));
      await user.click(await screen.findByRole('button', { name: 'Borrar' }));
      expect(
        screen.getByText('¿Borrar la regla «Tambo»? Lo que ya sugirió se queda.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(actions(sent)).toEqual([]);

      await user.click(screen.getByRole('button', { name: 'Borrar' }));
      await user.click(screen.getByRole('button', { name: 'Sí, borrar' }));

      await waitFor(() => {
        expect(actions(sent)).toEqual([
          { method: 'DELETE', path: `/api/v1/categorization-rules/${RULE.id}`, body: null },
        ]);
      });
    });
  });
});
