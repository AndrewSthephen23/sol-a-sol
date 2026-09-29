import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { IMPORT_MAX_BYTES, type ImportPreview } from './import-model';
import { ImportScreen } from './import-screen';

const FOOD = '11111111-1111-4111-8111-111111111111';
const BCP = '33333333-3333-4333-8333-333333333333';
const STAMPS = { createdAt: '2026-09-28T15:00:00Z', updatedAt: '2026-09-28T15:00:00Z' };
const CSV = 'fecha,tipo,monto,moneda,descripcion\n2026-09-17,Gasto variable,25.90,PEN,Almuerzo\n';

const CLEAN: ImportPreview = {
  rows: 3,
  transactions: 2,
  transfers: 1,
  alreadyImported: [],
  problems: [],
  ignoredColumns: [],
  categories: [],
  paymentMethods: [],
  newTags: [],
};

const RESULT = {
  transactions: 2,
  transfers: 1,
  alreadyImported: [],
  createdCategories: 1,
  createdPaymentMethods: 1,
  restored: 0,
};

function problem(status: number, code: string): Response {
  return Response.json(
    { type: `urn:sol-a-sol:error:${code}`, title: 'Error', status, detail: 'English.' },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

interface Handlers {
  preview?: (body: { csv: string }) => Response;
  confirm?: (body: unknown) => Response;
}

function setup({
  preview = () => Response.json(CLEAN),
  confirm = () => Response.json(RESULT, { status: 201 }),
}: Handlers = {}) {
  const sent: { path: string; body: unknown }[] = [];
  const session = new Session({
    fetch: async (input) => {
      if (!(input instanceof Request)) return Response.json({ accessToken: 'token' });
      const { pathname } = new URL(input.url);
      if (pathname === '/api/v1/categories') {
        return Response.json([
          {
            id: FOOD,
            name: 'Comida',
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
          {
            id: BCP,
            alias: 'BCP',
            kind: 'ACCOUNT',
            institution: 'BCP',
            last4: null,
            currency: 'PEN',
            archivedAt: null,
            ...STAMPS,
          },
        ]);
      }
      const body = (await input.json()) as { csv: string };
      sent.push({ path: pathname, body });

      return pathname.endsWith('/preview') ? preview(body) : confirm(body);
    },
  });
  session.signIn('token');
  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <ImportScreen />
      </QueryProvider>
    </SessionProvider>,
  );

  return { sent, user: userEvent.setup() };
}

function csvFile(content = CSV, name = 'finanzas.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('ImportScreen', () => {
  it('previews the file as text and imports it all at once', async () => {
    const { sent, user } = setup();

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());
    const preview = await screen.findByRole('region', { name: 'Vista previa de «finanzas.csv»' });
    expect(preview).toHaveTextContent('3 filas leídas: 2 transacciones y 1 transferencia.');

    await user.click(screen.getByRole('button', { name: 'Importar 3 movimientos' }));

    expect(await screen.findByRole('heading', { name: 'Importación lista' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se importaron 3 movimientos: 2 transacciones y 1 transferencia.',
    );
    expect(screen.getByText(/Se crearon 1 categoría y 1 método de pago/)).toBeInTheDocument();
    expect(sent).toEqual([
      { path: '/api/v1/transactions/import/preview', body: { csv: CSV } },
      {
        path: '/api/v1/transactions/import',
        body: { csv: CSV, categories: [], paymentMethods: [] },
      },
    ]);
  });

  it('refuses a file over 1 MB without sending it', async () => {
    const { sent, user } = setup();

    await user.upload(
      screen.getByLabelText('Elige el archivo'),
      csvFile('x'.repeat(IMPORT_MAX_BYTES + 1)),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo pasa de 1 MB.');
    expect(sent).toEqual([]);
  });

  it('refuses an empty file', async () => {
    const { sent, user } = setup();

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile('  \n'));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío.');
    expect(sent).toEqual([]);
  });

  it('lists each problem by line and column, in Spanish, and does not offer to import', async () => {
    const { user } = setup({
      preview: () =>
        Response.json({
          ...CLEAN,
          problems: [
            { line: 3, field: 'fecha', code: 'INVALID_LOCAL_DATE', message: 'Invalid date' },
            { line: 5, field: 'tipo', code: 'IMPORT_TYPE_UNKNOWN', message: 'Unknown type' },
          ],
          ignoredColumns: ['Mes'],
          alreadyImported: [7],
        }),
    });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());

    const problems = await screen.findByRole('table');
    expect(
      within(problems)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual([
      'LíneaColumnaQué pasa',
      '3fechaLa fecha va como AAAA-MM-DD, por ejemplo 2026-09-17.',
      expect.stringContaining('5tipoTipo desconocido'),
    ]);
    expect(screen.getByText('Hay 2 problemas')).toBeInTheDocument();
    expect(screen.getByText('1 fila ya se importó antes y se omitirá.')).toBeInTheDocument();
    expect(screen.getByText(/se ignoran: Mes/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid date/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importar/ })).not.toBeInTheDocument();
  });

  it('shows the first 100 problems and says how many more there are', async () => {
    const { user } = setup({
      preview: () =>
        Response.json({
          ...CLEAN,
          problems: Array.from({ length: 130 }, (_, index) => ({
            line: index + 2,
            field: 'monto',
            code: 'INVALID_AMOUNT',
            message: 'x',
          })),
        }),
    });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());

    expect(await screen.findByText('Y 30 más. Corrige estos primero.')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(101);
  });

  it('asks for a decision on what is missing, checked with the rules of the domain', async () => {
    const { sent, user } = setup({
      preview: () =>
        Response.json({
          ...CLEAN,
          categories: [
            {
              type: 'VARIABLE_EXPENSE',
              category: 'Snacks',
              subcategory: null,
              status: 'missing',
              lines: [2],
            },
            {
              type: 'INCOME',
              category: 'Bonos',
              subcategory: null,
              status: 'archived',
              lines: [3, 4],
            },
          ],
          paymentMethods: [
            { alias: 'Visa Oro', status: 'missing', lines: [2] },
            { alias: 'Yape', status: 'archived', lines: [5] },
          ],
        }),
    });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());
    const snacks = await screen.findByRole('group', { name: /Snacks — 1 fila, no existe/ });
    await user.click(within(snacks).getByRole('radio', { name: 'Usar otra' }));
    await user.click(screen.getByRole('button', { name: 'Importar 3 movimientos' }));

    expect(snacks).toHaveAccessibleDescription('Elige una categoría.');
    expect(screen.getByRole('group', { name: /Visa Oro/ })).toHaveAccessibleDescription(
      'Elige qué tipo de método es.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa las decisiones marcadas');

    await user.selectOptions(within(snacks).getByLabelText('Categoría para Snacks'), FOOD);
    await user.selectOptions(screen.getByLabelText('Tipo de «Visa Oro»'), 'CREDIT_CARD');
    await user.selectOptions(screen.getByLabelText('Moneda de «Visa Oro»'), 'BOTH');
    await user.type(screen.getByLabelText('Banco de «Visa Oro»'), 'BCP');
    await user.click(screen.getByRole('button', { name: 'Importar 3 movimientos' }));
    expect(screen.getByRole('group', { name: /Visa Oro/ })).toHaveAccessibleDescription(
      'Una tarjeta de crédito necesita sus últimos 4 dígitos.',
    );

    await user.type(screen.getByLabelText('Últimos 4 dígitos de «Visa Oro»'), '1234');
    const yape = screen.getByRole('group', { name: /Yape/ });
    await user.click(within(yape).getByRole('radio', { name: 'Usar otro' }));
    await user.selectOptions(within(yape).getByLabelText('Método de pago para «Yape»'), BCP);
    await user.click(screen.getByRole('button', { name: 'Importar 3 movimientos' }));

    await screen.findByRole('heading', { name: 'Importación lista' });
    expect(sent.at(-1)?.body).toEqual({
      csv: CSV,
      categories: [
        {
          type: 'VARIABLE_EXPENSE',
          category: 'Snacks',
          subcategory: null,
          action: 'use',
          categoryId: FOOD,
        },
        { type: 'INCOME', category: 'Bonos', subcategory: null, action: 'restore' },
      ],
      paymentMethods: [
        {
          alias: 'Visa Oro',
          action: 'create',
          kind: 'CREDIT_CARD',
          institution: 'BCP',
          last4: '1234',
          currency: null,
        },
        { alias: 'Yape', action: 'use', paymentMethodId: BCP },
      ],
    });
  });

  it('clears what a new kind of method does not take', async () => {
    const { user } = setup({
      preview: () =>
        Response.json({
          ...CLEAN,
          paymentMethods: [{ alias: 'Caja', status: 'missing', lines: [2] }],
        }),
    });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());
    await user.selectOptions(await screen.findByLabelText('Tipo de «Caja»'), 'CREDIT_CARD');
    await user.selectOptions(screen.getByLabelText('Moneda de «Caja»'), 'BOTH');
    await user.type(screen.getByLabelText('Últimos 4 dígitos de «Caja»'), '9876');
    await user.selectOptions(screen.getByLabelText('Tipo de «Caja»'), 'WALLET');

    expect(screen.queryByLabelText('Últimos 4 dígitos de «Caja»')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Moneda de «Caja»')).toHaveValue('');
    await user.selectOptions(screen.getByLabelText('Tipo de «Caja»'), 'CASH');
    expect(screen.queryByLabelText('Banco de «Caja»')).not.toBeInTheDocument();
  });

  it('says there is nothing new when every row was already imported', async () => {
    const { user } = setup({
      preview: () =>
        Response.json({ ...CLEAN, transactions: 0, transfers: 0, alreadyImported: [2, 3] }),
    });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());

    expect(
      await screen.findByRole('button', { name: 'No hay nada nuevo que importar' }),
    ).toBeDisabled();
  });

  it.each([
    ['a broken file', 'MALFORMED_CSV', 422, 'no es un CSV válido'],
    ['missing columns', 'IMPORT_COLUMNS_MISSING', 422, 'faltan columnas obligatorias'],
    ['too many rows', 'IMPORT_TOO_MANY_ROWS', 413, 'pasa de 5 000 filas'],
    ['something unknown', 'SOMETHING_NEW', 422, 'Algo salió mal'],
  ])('explains %s found while previewing', async (_case, code, status, message) => {
    const { user } = setup({ preview: () => problem(status, code) });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('explains why the import was refused, and nothing was saved', async () => {
    const { user } = setup({ confirm: () => problem(409, 'IMPORT_CONFLICT') });

    await user.upload(screen.getByLabelText('Elige el archivo'), csvFile());
    await user.click(await screen.findByRole('button', { name: 'Importar 3 movimientos' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('no se guardó nada');
    });
    expect(screen.queryByRole('heading', { name: 'Importación lista' })).not.toBeInTheDocument();
  });
});
