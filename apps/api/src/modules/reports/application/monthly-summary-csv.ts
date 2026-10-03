import {
  type Comparison,
  formatPercentage,
  type GoalStatus,
  type Money,
  type TransactionType,
} from '@sol-a-sol/domain';

import type { MonthlySummaryView } from './monthly-summary.js';

/**
 * El resumen mensual como CSV (decisión 15 de H6, 2026-10-03): **un solo archivo** con todas las
 * secciones como filas, separado por `;` (Excel en español), con **BOM UTF-8** para que lea las
 * tildes, montos con **punto decimal y sin separador de miles** (tal como los da `toFixed`, nunca
 * por `number`) y porcentajes con 2 decimales.
 *
 * **Nada del usuario se ejecuta como fórmula:** un texto suyo (categoría, comercio, alias, meta)
 * que empiece con `=`, `+`, `-`, `@`, tabulación o retorno de carro lleva un `'` delante; y todo
 * campo con `;`, comillas o saltos de línea va entre comillas, con las comillas duplicadas.
 */

export interface CsvFile {
  filename: string;
  content: string;
}

const SEPARATOR = ';';
const LINE_END = '\r\n';
/** Marca de orden de bytes: así Excel sabe que el archivo es UTF-8 y lee bien las tildes. */
const BOM = String.fromCodePoint(0xfeff);
const HEADER = [
  'Sección',
  'Concepto',
  'Moneda',
  'Monto',
  'Comparado con',
  'Diferencia',
  'Porcentaje',
];
/** Lo que Excel, Sheets o LibreOffice leerían como el comienzo de una fórmula. */
const FORMULA_START = /^[=+\-@\t\r]/u;
/** Lo que obliga a encerrar el campo entre comillas. */
const NEEDS_QUOTES = /[";\r\n]/u;

const TYPE_NAMES: Readonly<Record<TransactionType, string>> = {
  INCOME: 'Ingresos',
  FIXED_EXPENSE: 'Gasto fijo',
  VARIABLE_EXPENSE: 'Gasto variable',
  SAVING: 'Ahorro',
  INVESTMENT: 'Inversión',
  DEBT: 'Deuda',
};

const STATUS_NAMES: Readonly<Record<GoalStatus, string>> = {
  ON_TRACK: 'vas bien',
  AT_RISK: 'en riesgo',
  ACHIEVED: 'cumplida',
  OVERDUE: 'vencida',
};

/** Un texto que viene del usuario: nunca empieza una fórmula. */
class UserText {
  constructor(readonly value: string) {}
}

type Cell = string | UserText;

interface Row {
  section: string;
  concept: Cell;
  currency?: string;
  amount?: string;
  reference?: string;
  difference?: string;
  percentage?: string;
}

export function monthlySummaryCsv(view: MonthlySummaryView): CsvFile {
  const { periods } = view;
  const month = `${String(periods.year)}-${String(periods.month).padStart(2, '0')}`;
  const rows = [
    ...periodRows(view),
    ...view.summary.currencies.flatMap((currency) => currencyRows(view, currency)),
    ...budgetRows(view),
    ...cardRows(view),
    ...goalRows(view),
  ];
  const lines = [
    HEADER.map(field),
    ...rows.map((row) =>
      [
        row.section,
        row.concept,
        row.currency ?? '',
        row.amount ?? '',
        row.reference ?? '',
        row.difference ?? '',
        row.percentage ?? '',
      ].map(field),
    ),
  ];

  return {
    filename: `resumen-${month}.csv`,
    content: BOM + lines.map((cells) => cells.join(SEPARATOR) + LINE_END).join(''),
  };
}

/** Un campo listo para el archivo: lo del usuario, desarmado como fórmula; todo, bien citado. */
function field(cell: Cell): string {
  const text =
    cell instanceof UserText && FORMULA_START.test(cell.value) ? `'${cell.value}` : textOf(cell);

  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function textOf(cell: Cell): string {
  return cell instanceof UserText ? cell.value : cell;
}

function percent(value: { toString(): string } | null): string {
  return value === null ? '' : formatPercentage(value.toString());
}

function comparison(entry: Comparison): Omit<Row, 'section' | 'concept'> {
  return {
    currency: entry.amount.currency,
    amount: entry.amount.toFixed(),
    reference: entry.previous.toFixed(),
    difference: entry.difference.toFixed(),
    percentage: percent(entry.change),
  };
}

function money(amount: Money): Pick<Row, 'currency' | 'amount'> {
  return { currency: amount.currency, amount: amount.toFixed() };
}

function periodRows({ periods }: MonthlySummaryView): Row[] {
  const { current, previous } = periods;

  return [
    {
      section: 'Periodo',
      concept: `Del ${current.from.toString()} al ${current.to.toString()} (${
        periods.complete ? 'mes cerrado' : 'mes en curso'
      })`,
    },
    {
      section: 'Comparado con',
      concept: `Del ${previous.from.toString()} al ${previous.to.toString()}`,
    },
  ];
}

function currencyRows(
  view: MonthlySummaryView,
  entry: MonthlySummaryView['summary']['currencies'][number],
): Row[] {
  const categoryName = (categoryId: string) =>
    new UserText(view.categories.get(categoryId) ?? 'Categoría sin nombre');
  const { totals } = entry;

  return [
    { section: 'Totales', concept: 'Ingresos', ...money(totals.income) },
    { section: 'Totales', concept: 'Gasto (fijo + variable)', ...money(totals.expense) },
    { section: 'Totales', concept: 'Ahorro (con inversión)', ...money(totals.saving) },
    { section: 'Totales', concept: 'Deuda', ...money(totals.debt) },
    { section: 'Totales', concept: 'Saldo', ...money(totals.balance) },
    {
      section: 'Tasa de ahorro',
      concept: entry.savingsRate === null ? 'Sin ingresos' : 'Ahorro / ingresos',
      currency: entry.currency,
      percentage: percent(entry.savingsRate),
    },
    ...entry.byType.map((row) => ({
      section: 'Por tipo',
      concept: TYPE_NAMES[row.type],
      ...comparison(row),
    })),
    ...entry.byCategory.map((row) => ({
      section: 'Por categoría',
      concept: new UserText(
        `${textOf(categoryName(row.categoryId))} (${TYPE_NAMES[row.type].toLowerCase()})`,
      ),
      ...comparison(row),
    })),
    ...entry.topCategories.map((row) => ({
      section: 'Top categorías',
      concept: categoryName(row.categoryId),
      ...money(row.amount),
      percentage: percent(row.share),
    })),
    ...entry.topMerchants.map((row) => ({
      section: 'Top comercios',
      concept: new UserText(
        `${row.merchant} (${String(row.count)} ${row.count === 1 ? 'compra' : 'compras'})`,
      ),
      ...money(row.amount),
    })),
  ];
}

function budgetRows(view: MonthlySummaryView): Row[] {
  const { budget } = view.summary;
  if (budget === undefined) return [];
  if (budget.status === 'NONE') return [{ section: 'Presupuesto', concept: 'Sin presupuesto' }];

  return [
    ...budget.currencies.map((row) => ({
      section: 'Presupuesto',
      concept: 'Ejecutado (real contra planeado)',
      ...money(row.actual),
      reference: row.planned.toFixed(),
      difference: row.planned.subtract(row.actual).toFixed(),
      percentage: percent(row.executed),
    })),
    ...budget.exceeded.map((line) => ({
      section: 'Presupuesto excedido',
      concept: new UserText(view.categories.get(line.categoryId) ?? 'Categoría sin nombre'),
      ...money(line.actual),
      reference: line.planned.toFixed(),
      difference: line.difference.toFixed(),
      percentage: percent(line.executed),
    })),
  ];
}

function cardRows(view: MonthlySummaryView): Row[] {
  return (view.summary.cards ?? []).flatMap((card) => {
    const label = view.cards.get(card.cardId);
    const name = [label?.alias, label?.institution, label?.last4 && `•••• ${label.last4}`]
      .filter((part) => part !== undefined && part !== null && part !== '')
      .join(' ');
    const { statement } = card;

    return [
      ...card.charges.map((charge) => ({
        section: 'Tarjetas',
        concept: new UserText(`${name} · consumo del mes`),
        ...money(charge),
      })),
      ...(statement === null
        ? []
        : statement.balances.map((entry) => ({
            section: 'Tarjetas',
            concept: new UserText(
              `${name} · por pagar del estado del ${statement.closingDate.toString()} ` +
                `(fecha límite de pago: ${statement.dueDate.toString()})`,
            ),
            ...money(entry.remaining),
            reference: entry.balance.toFixed(),
          }))),
    ];
  });
}

function goalRows(view: MonthlySummaryView): Row[] {
  return (view.summary.goals ?? []).flatMap((goal) => {
    const found = view.goals.get(goal.goalId);
    const name = found?.name ?? 'Meta sin nombre';

    return [
      {
        section: 'Metas',
        concept: new UserText(`${name} · aportado en el mes`),
        ...money(goal.contributed),
      },
      {
        section: 'Metas',
        concept: new UserText(`${name} · ahorrado (${STATUS_NAMES[goal.progress.status]})`),
        ...money(goal.progress.saved),
        reference: found?.target.toFixed() ?? '',
        percentage: percent(goal.progress.percentage),
      },
    ];
  });
}
