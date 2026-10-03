import {
  computeMonthlySummary,
  LocalDate,
  Money,
  type MonthlySummaryInput,
  monthlySummaryPeriods,
} from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import { monthlySummaryCsv } from './monthly-summary-csv.js';
import type { MonthlySummaryView } from './monthly-summary.js';

const pen = (amount: string) => Money.of(amount, 'PEN');
const usd = (amount: string) => Money.of(amount, 'USD');
const date = (text: string) => LocalDate.parse(text);

/** Setiembre de 2026, cerrado, con lo que cada prueba agregue. */
function view(
  input: Partial<Omit<MonthlySummaryInput, 'periods'>> = {},
  names: { categories?: [string, string][] } = {},
): MonthlySummaryView {
  const periods = monthlySummaryPeriods(2026, 9, date('2026-10-03'));

  return {
    periods,
    summary: computeMonthlySummary({
      periods,
      current: { byCategory: [], byMerchant: [] },
      previous: { byCategory: [] },
      ...input,
    }),
    categories: new Map(names.categories ?? []),
    cards: new Map([['visa', { alias: 'Visa', institution: 'BCP', last4: '4321' }]]),
    goals: new Map([['trip', { name: 'Viaje', target: pen('1200.00') }]]),
  };
}

function lines(file: { content: string }): string[] {
  const BOM = String.fromCodePoint(0xfeff);
  const text = file.content.startsWith(BOM) ? file.content.slice(1) : file.content;

  return text.split('\r\n').slice(0, -1);
}

describe('monthlySummaryCsv', () => {
  it('starts with a UTF-8 BOM and a header, separated by semicolons, lines ending in CRLF', () => {
    const file = monthlySummaryCsv(view());

    expect(file.filename).toBe('resumen-2026-09.csv');
    expect(file.content.codePointAt(0)).toBe(0xfeff);
    expect(file.content.slice(1).startsWith('Sección;Concepto;Moneda;Monto;')).toBe(true);
    expect(file.content.endsWith('\r\n')).toBe(true);
    expect(lines(file)).toEqual([
      'Sección;Concepto;Moneda;Monto;Comparado con;Diferencia;Porcentaje',
      'Periodo;Del 2026-09-01 al 2026-09-30 (mes cerrado);;;;;',
      'Comparado con;Del 2026-08-01 al 2026-08-31;;;;;',
    ]);
  });

  it('names a single-digit month with two digits and a month in course as such', () => {
    const periods = monthlySummaryPeriods(2026, 10, date('2026-10-03'));
    const file = monthlySummaryCsv({
      ...view(),
      periods,
      summary: computeMonthlySummary({
        periods,
        current: { byCategory: [], byMerchant: [] },
        previous: { byCategory: [] },
      }),
    });

    expect(file.filename).toBe('resumen-2026-10.csv');
    expect(lines(file)[1]).toBe('Periodo;Del 2026-10-01 al 2026-10-03 (mes en curso);;;;;');
  });

  it('writes totals, savings rate, types, categories and tops with exact amounts', () => {
    const file = monthlySummaryCsv(
      view(
        {
          current: {
            byCategory: [
              { categoryId: 'pay', type: 'INCOME', amount: pen('3000.00') },
              { categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('1234.50') },
              { categoryId: 'savings', type: 'SAVING', amount: pen('500.00') },
            ],
            byMerchant: [
              { merchant: 'Tambo', type: 'VARIABLE_EXPENSE', amount: pen('1234.50'), count: 2 },
            ],
          },
          previous: {
            byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('1000.00') }],
          },
        },
        {
          categories: [
            ['pay', 'Planilla'],
            ['food', 'Víveres'],
            ['savings', 'Colchón'],
          ],
        },
      ),
    );
    const rows = lines(file);

    expect(rows).toContain('Totales;Ingresos;PEN;3000.00;;;');
    expect(rows).toContain('Totales;Gasto (fijo + variable);PEN;1234.50;;;');
    expect(rows).toContain('Totales;Saldo;PEN;1265.50;;;');
    expect(rows).toContain('Tasa de ahorro;Ahorro / ingresos;PEN;;;;16.67');
    expect(rows).toContain('Por tipo;Gasto variable;PEN;1234.50;1000.00;234.50;23.45');
    expect(rows).toContain('Por tipo;Inversión;PEN;0.00;0.00;0.00;');
    expect(rows).toContain(
      'Por categoría;Víveres (gasto variable);PEN;1234.50;1000.00;234.50;23.45',
    );
    expect(rows).toContain('Top categorías;Víveres;PEN;1234.50;;;100.00');
    expect(rows).toContain('Top comercios;Tambo (2 compras);PEN;1234.50;;;');
  });

  it('says there is no income instead of a savings rate', () => {
    const rows = lines(
      monthlySummaryCsv(
        view({
          current: {
            byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('10.00') }],
            byMerchant: [
              { merchant: 'Wong', type: 'VARIABLE_EXPENSE', amount: pen('10.00'), count: 1 },
            ],
          },
        }),
      ),
    );

    expect(rows).toContain('Tasa de ahorro;Sin ingresos;PEN;;;;');
    expect(rows).toContain('Top comercios;Wong (1 compra);PEN;10.00;;;');
    expect(rows).toContain('Top categorías;Categoría sin nombre;PEN;10.00;;;100.00');
  });

  it('keeps negative amounts as numbers: only what the user wrote is defused', () => {
    const rows = lines(
      monthlySummaryCsv(
        view({
          current: {
            byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('10.00') }],
            byMerchant: [],
          },
        }),
      ),
    );

    expect(rows).toContain('Totales;Saldo;PEN;-10.00;;;');
  });

  it.each([
    ['=HYPERLINK("http://x")', `Top comercios;"'=HYPERLINK(""http://x"") (1 compra)";PEN;1.00;;;`],
    ['+51 999', "Top comercios;'+51 999 (1 compra);PEN;1.00;;;"],
    ['-2+3', "Top comercios;'-2+3 (1 compra);PEN;1.00;;;"],
    ['@SUM(A1)', "Top comercios;'@SUM(A1) (1 compra);PEN;1.00;;;"],
  ])('defuses a merchant that starts a formula: %j', (merchant, expected) => {
    const rows = lines(
      monthlySummaryCsv(
        view({
          current: {
            byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('1.00') }],
            byMerchant: [{ merchant, type: 'VARIABLE_EXPENSE', amount: pen('1.00'), count: 1 }],
          },
        }),
      ),
    );

    expect(rows).toContain(expected);
  });

  it.each([
    ['\tcmd', "Top categorías;'\tcmd;PEN;1.00;;;100.00\r\n"],
    ['\rcmd', `Top categorías;"'\rcmd";PEN;1.00;;;100.00\r\n`],
  ])(
    'defuses a category name that starts with a tab or a carriage return: %j',
    (name, expected) => {
      const file = monthlySummaryCsv(
        view(
          {
            current: {
              byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('1.00') }],
              byMerchant: [],
            },
          },
          { categories: [['food', name]] },
        ),
      );

      expect(file.content).toContain(expected);
    },
  );

  it('does not touch a name that only has a formula sign inside', () => {
    const rows = lines(
      monthlySummaryCsv(
        view(
          {
            current: {
              byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('1.00') }],
              byMerchant: [],
            },
          },
          { categories: [['food', 'Pan + leche']] },
        ),
      ),
    );

    expect(rows).toContain('Top categorías;Pan + leche;PEN;1.00;;;100.00');
  });

  it('quotes a name with a semicolon, quotes or a line break, doubling the quotes', () => {
    const file = monthlySummaryCsv(
      view(
        {
          current: {
            byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('5.00') }],
            byMerchant: [],
          },
        },
        { categories: [['food', 'Comida; "rica"\nen casa']] },
      ),
    );

    expect(file.content).toContain(
      'Top categorías;"Comida; ""rica""\nen casa";PEN;5.00;;;100.00\r\n',
    );
  });

  it('writes each currency apart', () => {
    const rows = lines(
      monthlySummaryCsv(
        view({
          current: {
            byCategory: [
              { categoryId: 'pay', type: 'INCOME', amount: pen('3000.00') },
              { categoryId: 'pay-usd', type: 'INCOME', amount: usd('1000.00') },
            ],
            byMerchant: [],
          },
        }),
      ),
    );

    expect(rows.filter((row) => row.startsWith('Totales;Ingresos;'))).toEqual([
      'Totales;Ingresos;PEN;3000.00;;;',
      'Totales;Ingresos;USD;1000.00;;;',
    ]);
  });

  it('writes the budget, the cards and the goals that came, and nothing of a module that did not', () => {
    const withAll = lines(
      monthlySummaryCsv(
        view(
          {
            current: {
              byCategory: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', amount: pen('120.00') }],
              byMerchant: [],
            },
            budget: {
              lines: [{ categoryId: 'food', type: 'VARIABLE_EXPENSE', planned: pen('100.00') }],
            },
            cards: [
              {
                cardId: 'visa',
                archived: false,
                charges: [pen('50.00')],
                statements: [
                  {
                    closingDate: date('2026-09-20'),
                    dueDate: date('2026-10-15'),
                    balances: [{ balance: pen('110.00'), remaining: pen('45.00') }],
                  },
                ],
              },
            ],
            goals: [
              {
                goalId: 'trip',
                archived: false,
                target: pen('1200.00'),
                startDate: date('2026-01-01'),
                endDate: date('2026-12-31'),
                contributions: [
                  { kind: 'CONTRIBUTION', amount: pen('300.00'), date: date('2026-09-15') },
                ],
              },
            ],
          },
          { categories: [['food', 'Víveres']] },
        ),
      ),
    );
    const none = lines(monthlySummaryCsv(view()));
    const noBudget = lines(monthlySummaryCsv(view({ budget: { lines: [] } })));

    expect(withAll).toContain(
      'Presupuesto;Ejecutado (real contra planeado);PEN;120.00;100.00;-20.00;120.00',
    );
    expect(withAll).toContain('Presupuesto excedido;Víveres;PEN;120.00;100.00;-20.00;120.00');
    expect(withAll).toContain('Tarjetas;Visa BCP •••• 4321 · consumo del mes;PEN;50.00;;;');
    expect(withAll).toContain(
      'Tarjetas;Visa BCP •••• 4321 · por pagar del estado del 2026-09-20 (fecha límite de pago: 2026-10-15);PEN;45.00;110.00;;',
    );
    expect(withAll).toContain('Metas;Viaje · aportado en el mes;PEN;300.00;;;');
    expect(withAll).toContain('Metas;Viaje · ahorrado (en riesgo);PEN;300.00;1200.00;;25.00');
    expect(noBudget).toContain('Presupuesto;Sin presupuesto;;;;;');
    expect(none.some((row) => /^(Presupuesto|Tarjetas|Metas);/u.test(row))).toBe(false);
  });

  it('names a card with only what identifies it', () => {
    const base = view({
      cards: [{ cardId: 'visa', archived: false, charges: [pen('5.00')], statements: [] }],
    });
    const rows = lines(
      monthlySummaryCsv({
        ...base,
        cards: new Map([['visa', { alias: 'Visa', institution: null, last4: null }]]),
      }),
    );

    expect(rows).toContain('Tarjetas;Visa · consumo del mes;PEN;5.00;;;');
  });
});
