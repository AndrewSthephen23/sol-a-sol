import { formatPercentage } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';

import { chartNumber } from '@/features/dashboard/dashboard-model';

export type AnnualSummary =
  paths['/api/v1/reports/annual']['get']['responses'][200]['content']['application/json'];
export type AnnualCurrency = AnnualSummary['currencies'][number];
type AnnualRow = AnnualCurrency['rows'][number];

/** Los años que acepta la API (como el presupuesto). */
export const FIRST_YEAR = 2000;

export const MONTH_HEADERS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Oct',
  'Nov',
  'Dic',
] as const;

export const ROW_LABELS: Readonly<Record<AnnualRow['row'], string>> = {
  INCOME: 'Ingresos',
  FIXED_EXPENSE: 'Gasto fijo',
  VARIABLE_EXPENSE: 'Gasto variable',
  EXPENSE: 'Total gasto',
  SAVING: 'Ahorro',
  INVESTMENT: 'Inversión',
  DEBT: 'Deuda',
  BALANCE: 'Saldo',
};

/** Las filas que suman otras (total y saldo): se destacan en la tabla. */
export const TOTAL_ROWS: ReadonlySet<AnnualRow['row']> = new Set(['EXPENSE', 'BALANCE']);

/** Un mes que todavía no llega es «—», no un cero (decisión 16). */
export function cellText(amount: string | null, currency: Currency): string {
  return amount === null ? '—' : formatMoney(amount, currency);
}

/** El año que trae la URL (`?year=2026`) si es razonable y no futuro; si no, el de hoy. */
export function readYear(text: string | null, current: number): number {
  const year = Number(text);

  return text !== null && /^\d{4}$/u.test(text) && year >= FIRST_YEAR && year <= current
    ? year
    : current;
}

/** «En 2026 ahorraste el 15.20 % de lo que ganaste», o que no hubo ingresos. */
export function annualSavingsText(year: number, rate: string | null): string {
  return rate === null
    ? `En ${String(year)} no hubo ingresos`
    : `En ${String(year)} ahorraste el ${formatPercentage(rate)} % de lo que ganaste`;
}

/** Las barras: ingresos, gastos, ahorro e inversión por mes. */
export const BAR_SERIES = [
  { row: 'INCOME', label: 'Ingresos', fill: '#16a34a' },
  { row: 'EXPENSE', label: 'Gastos', fill: '#f59e0b' },
  { row: 'SAVING', label: 'Ahorro', fill: '#0284c7' },
  { row: 'INVESTMENT', label: 'Inversión', fill: '#7c3aed' },
] as const;

export type BarPoint = { month: string } & Record<string, number | string | null>;

/**
 * Los datos de las barras. **Solo para dibujar**: el monto pasa a número para el alto de la barra
 * (`chartNumber`) y nunca se muestra ni se calcula con él; un mes que no llega queda sin barra.
 */
export function barData(entry: AnnualCurrency): BarPoint[] {
  return MONTH_HEADERS.map((month, index) => {
    const point: BarPoint = { month };
    for (const series of BAR_SERIES) {
      const amount = entry.rows.find((row) => row.row === series.row)?.months[index] ?? null;
      point[series.row] = amount === null ? null : chartNumber(amount);
      point[`${series.row}_label`] = amount === null ? null : formatMoney(amount, entry.currency);
    }

    return point;
  });
}
