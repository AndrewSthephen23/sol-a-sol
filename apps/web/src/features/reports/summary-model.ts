import { formatPercentage } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import { type Currency, formatMoney } from '@/shared/format/money';
import { formatDay, formatDayMonth, formatMonth } from '@/shared/time/dates';

export type MonthlySummary =
  paths['/api/v1/reports/monthly-summary']['get']['responses'][200]['content']['application/json'];
export type CurrencySummary = MonthlySummary['currencies'][number];
type TypeRow = CurrencySummary['byType'][number];
type Comparison = Pick<TypeRow, 'amount' | 'difference' | 'change'>;
export type SummaryCard = NonNullable<MonthlySummary['cards']>[number];
export type SummaryGoal = NonNullable<MonthlySummary['goals']>[number];
type Budget = NonNullable<MonthlySummary['budget']>;

export const TYPE_LABELS: Readonly<Record<TypeRow['type'], string>> = {
  INCOME: 'Ingresos',
  FIXED_EXPENSE: 'Gasto fijo',
  VARIABLE_EXPENSE: 'Gasto variable',
  SAVING: 'Ahorro',
  INVESTMENT: 'Inversión',
  DEBT: 'Deuda',
};

const STATUS_LABELS: Readonly<Record<SummaryGoal['status'], string>> = {
  ON_TRACK: 'vas bien',
  AT_RISK: 'en riesgo',
  ACHIEVED: '¡cumplida!',
  OVERDUE: 'vencida',
};

/** Sin el signo: «S/ 10.00 menos» ya dice la dirección. */
function absolute(amount: string): string {
  return amount.startsWith('-') ? amount.slice(1) : amount;
}

/** `2026-09` o `2026-09-03` → «setiembre» (con el año si no es el del periodo). */
function monthName(date: string, sameYearAs: string): string {
  const name = formatMonth(date.slice(0, 7));

  return date.slice(0, 4) === sameYearAs.slice(0, 4) ? name.replace(/ de \d{4}$/u, '') : name;
}

/** «setiembre» o, en el mes en curso, «del 1 al 3 de setiembre»: lo que se compara. */
export function previousLabel(summary: MonthlySummary): string {
  const { from, to } = summary.previousPeriod;
  if (summary.period.complete) return `en ${monthName(from, summary.period.from)}`;

  return `del ${String(Number(from.slice(8)))} al ${formatDayMonth(to)}`;
}

/** «S/ 150.00 más que en agosto (+50.00 %)»; con base cero, «(—)». La API ya hizo las cuentas. */
export function comparisonText(row: Comparison, currency: Currency, against: string): string {
  if (row.difference === '0.00') return `Igual que ${against}`;
  const direction = row.difference.startsWith('-') ? 'menos' : 'más';
  const change =
    row.change === null
      ? '—'
      : `${row.change.startsWith('-') ? '' : '+'}${formatPercentage(row.change)} %`;

  return `${formatMoney(absolute(row.difference), currency)} ${direction} que ${against} (${change})`;
}

/** «Ahorraste el 16.67 % de lo que ganaste», o sin ingresos no hay tasa. */
export function savingsRateText(rate: string | null): string {
  return rate === null
    ? 'Sin ingresos este mes'
    : `Ahorraste el ${formatPercentage(rate)} % de lo que ganaste`;
}

export function shareText(share: string | null): string {
  return share === null ? '' : ` (${formatPercentage(share)} % del gasto)`;
}

export function merchantText(
  merchant: CurrencySummary['topMerchants'][number],
  currency: Currency,
): string {
  const purchases = merchant.count === 1 ? 'compra' : 'compras';

  return `${merchant.merchant}: ${formatMoney(merchant.amount, currency)} en ${String(merchant.count)} ${purchases}`;
}

// --- Presupuesto -----------------------------------------------------------------------------

export function budgetExecutionText(
  row: Extract<Budget, { status: 'SET' }>['currencies'][number],
): string {
  const actual = formatMoney(row.actual, row.currency);
  if (row.executed === null) return `Gastaste ${actual} con un presupuesto de cero`;

  return `Ejecutaste el ${formatPercentage(row.executed)} % de tu presupuesto: ${actual} de ${formatMoney(row.planned, row.currency)}`;
}

export function exceededText(
  line: Extract<Budget, { status: 'SET' }>['exceeded'][number],
  name: string,
): string {
  const executed = line.executed === null ? '' : ` (${formatPercentage(line.executed)} %)`;

  return `${name}: te pasaste por ${formatMoney(absolute(line.difference), line.currency)}${executed}`;
}

// --- Tarjetas --------------------------------------------------------------------------------

/** Solo lo que identifica una tarjeta: «Visa BCP •••• 4321». */
export function cardTitle(card: SummaryCard): string {
  return [card.alias, card.institution, card.last4 === null ? null : `•••• ${card.last4}`]
    .filter((part) => part !== null && part !== '')
    .join(' ');
}

export function chargesText(card: SummaryCard, summary: MonthlySummary): string {
  if (card.charges.length === 0) return 'Sin consumos este mes';
  const amounts = card.charges.map((charge) => formatMoney(charge.amount, charge.currency));

  return `Consumiste ${amounts.join(' y ')} en ${monthName(summary.period.from, summary.period.from)}`;
}

/** «Estado del 20 de setiembre: por pagar S/ 45.00 (fecha límite de pago: jueves, 15 de octubre)». */
export function statementText(statement: NonNullable<SummaryCard['statement']>): string {
  const left = statement.balances
    .filter((entry) => entry.remaining !== '0.00')
    .map((entry) => formatMoney(entry.remaining, entry.currency));
  const owed = left.length === 0 ? 'pagado' : `por pagar ${left.join(' y ')}`;

  return `Estado del ${formatDayMonth(statement.closingDate)}: ${owed} (fecha límite de pago: ${formatDay(statement.dueDate)})`;
}

// --- Metas -----------------------------------------------------------------------------------

export function contributedText(goal: SummaryGoal): string {
  if (goal.contributed === '0.00') return 'Sin aportes este mes';
  const amount = formatMoney(absolute(goal.contributed), goal.currency);

  return goal.contributed.startsWith('-')
    ? `Retiraste ${amount} este mes`
    : `Aportaste ${amount} este mes`;
}

export function goalProgressText(goal: SummaryGoal): string {
  return `Llevas ${formatMoney(goal.saved, goal.currency)} (${formatPercentage(goal.percentage)} %), ${STATUS_LABELS[goal.status]}`;
}

/**
 * El aviso del cierre cuando quedan capturas sin revisar del mes (decisión 16 de H7): «Tienes 3
 * capturas sin revisar de setiembre (S/ 85.40): el resumen puede estar incompleto». Las sin monto
 * se cuentan pero no suman. `null` sin pendientes.
 */
export function pendingCapturesNotice(summary: MonthlySummary): string | null {
  const captures = summary.captures;
  if (captures === undefined || captures.count === 0) return null;
  const amounts = captures.totals.map(({ amount, currency }) => formatMoney(amount, currency));
  const noun = captures.count === 1 ? 'captura' : 'capturas';
  const of = monthName(summary.period.from, summary.period.from);

  return (
    `Tienes ${String(captures.count)} ${noun} sin revisar de ${of}` +
    (amounts.length === 0 ? '' : ` (${amounts.join(' y ')})`) +
    ': el resumen puede estar incompleto.'
  );
}
