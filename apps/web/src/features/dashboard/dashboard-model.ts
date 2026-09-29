import { formatPercentage, Money } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import { formatDay } from '@/shared/time/dates';
import type { CategoryInfo } from '@/features/transactions/labels';

export type MonthlyReport =
  paths['/api/v1/reports/monthly']['get']['responses'][200]['content']['application/json'];
export type CurrencyReport = MonthlyReport['currencies'][number];
export type Slice = CurrencyReport['distribution'][number];

/** Color de «Otras» y de una categoría que ya no se encuentra. */
export const NEUTRAL_COLOR = '#a8a29e';

/**
 * Un monto como número, **solo para dibujar** el alto de una barra o el ángulo de una porción.
 * Nunca se muestra ni se usa para calcular: lo que se lee va en texto, con `formatMoney`.
 */
export function chartNumber(amount: string): number {
  return Number(amount);
}

/** El % de una porción con 2 decimales (redondeo bancario); sin gasto no hay porcentaje. */
export function shareText(share: string | null): string {
  return share === null ? '—' : `${formatPercentage(share)} %`;
}

export function sliceName(slice: Slice, categories: ReadonlyMap<string, CategoryInfo>): string {
  if (slice.categoryId === null) return 'Otras';

  return categories.get(slice.categoryId)?.name ?? 'Categoría';
}

/** El color de la categoría en el catálogo; «Otras», gris. */
export function sliceColor(slice: Slice, categories: ReadonlyMap<string, CategoryInfo>): string {
  if (slice.categoryId === null) return NEUTRAL_COLOR;

  return categories.get(slice.categoryId)?.color ?? NEUTRAL_COLOR;
}

/** Tocar una categoría lleva a sus movimientos del mes (con los de sus subcategorías). */
export function categoryLink(categoryId: string, month: string): string {
  return `/transactions?${new URLSearchParams({ month, categoryId }).toString()}`;
}

/**
 * Lo que dicen las barras, en una frase: el gasto del periodo y el día que más se gastó. Es la
 * alternativa en texto del gráfico, para quien no lo ve.
 */
export function dailySummary(daily: CurrencyReport['daily'], currency: Currency): string {
  if (daily.length === 0) return 'El mes todavía no empieza.';
  let total = Money.zero(currency);
  let peak: { date: string; amount: Money } | null = null;
  for (const day of daily) {
    const amount = Money.of(day.amount, currency);
    total = total.add(amount);
    if (amount.isPositive() && (peak === null || amount.subtract(peak.amount).isPositive())) {
      peak = { date: day.date, amount };
    }
  }
  const days = daily.length === 1 ? '1 día' : `${String(daily.length)} días`;
  if (peak === null) return `Sin gastos en ${days}.`;

  return `${formatMoney(total.toFixed(), currency)} gastados en ${days}. El día de más gasto fue el ${formatDay(peak.date)}, con ${formatMoney(peak.amount.toFixed(), currency)}.`;
}
