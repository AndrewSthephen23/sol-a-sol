import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';
import { type LocalDate } from '../time/local-date.js';

/**
 * Ciclo de facturación y fecha límite de pago de una tarjeta de crédito, decididos con el autor el
 * 2026-09-29 (`docs/modules/credit-cards.md`).
 *
 * - El **día de corte cierra su ciclo**: con corte 20, el ciclo va del 21 del mes anterior al 20,
 *   los dos incluidos, y una compra del mismo 20 entra en el estado que cierra ese día (decisión 4).
 * - Un día de corte o de pago que el mes no tiene cae el **último día del mes** (CLAUDE.md), y el
 *   mes siguiente vuelve a su día: un corte 31 cierra el 28 de febrero y el 31 de marzo.
 * - **Sin ajuste por fines de semana ni feriados**: un vencimiento en domingo se queda en domingo.
 */

const MAX_DAY_OF_MONTH = 31;
/** Tope de la regla «N días después del corte»: lo mismo que exige la base de datos. */
export const MAX_DAYS_AFTER_STATEMENT = 60;

/** Del día siguiente al corte anterior hasta el corte, los dos incluidos. */
export interface BillingCycle {
  readonly start: LocalDate;
  /** El día de corte: la fecha del estado de cuenta. */
  readonly end: LocalDate;
}

/** Cómo se calcula la fecha límite de pago (decisión 5). */
export type PaymentDueRule =
  | { readonly kind: 'DAYS_AFTER_STATEMENT'; readonly days: number }
  | { readonly kind: 'DAY_OF_MONTH'; readonly day: number };

export class InvalidStatementDayError extends DomainError {
  readonly code = 'STATEMENT_DAY_INVALID';

  constructor(day: number) {
    super(`The statement day must be a day of the month, 1 to 31: got ${describeValue(day)}.`);
  }
}

export class InvalidPaymentDueRuleError extends DomainError {
  readonly code = 'PAYMENT_DUE_RULE_INVALID';

  constructor(kind: unknown, value: unknown) {
    super(`Invalid payment due rule: ${describeValue(kind)} with ${describeValue(value)}.`);
  }
}

export function assertStatementDay(day: number): void {
  if (!isDayOfMonth(day)) throw new InvalidStatementDayError(day);
}

export function assertPaymentDueRule(rule: PaymentDueRule): void {
  switch (rule.kind) {
    case 'DAYS_AFTER_STATEMENT':
      if (!isWithin(rule.days, MAX_DAYS_AFTER_STATEMENT)) {
        throw new InvalidPaymentDueRuleError(rule.kind, rule.days);
      }
      return;
    case 'DAY_OF_MONTH':
      if (!isDayOfMonth(rule.day)) throw new InvalidPaymentDueRuleError(rule.kind, rule.day);
      return;
    default:
      throw new InvalidPaymentDueRuleError((rule as { kind: unknown }).kind, undefined);
  }
}

/** El ciclo que **contiene** `date`. */
export function computeBillingCycle(statementDay: number, date: LocalDate): BillingCycle {
  assertStatementDay(statementDay);
  const statementThisMonth = date.withDayOfMonth(statementDay);
  // Se cambia de mes desde el día 1 y recién después se pone el día de corte: `plusMonths` sobre
  // un corte ya ajustado (28 de febrero) arrastraría el 28 a marzo.
  const end = date.isAfter(statementThisMonth)
    ? statementInMonth(date, 1, statementDay)
    : statementThisMonth;
  const start = statementInMonth(end, -1, statementDay).plusDays(1);
  return { start, end };
}

/** El ciclo anterior: el que cierra el día antes de que empiece `cycle`. */
export function previousBillingCycle(statementDay: number, cycle: BillingCycle): BillingCycle {
  return computeBillingCycle(statementDay, cycle.start.plusDays(-1));
}

/** El ciclo siguiente: el que empieza el día después del corte de `cycle`. */
export function nextBillingCycle(statementDay: number, cycle: BillingCycle): BillingCycle {
  return computeBillingCycle(statementDay, cycle.end.plusDays(1));
}

/**
 * Hasta cuándo se paga el estado de cuenta que cierra el día `statement`.
 *
 * Con día fijo, vence la **primera vez que llega ese día después del corte**: del mismo mes si
 * cae después, del siguiente si es igual o anterior (decisión 5). Si el mes no tiene el día, cae
 * el último, pero nunca el mismo día del corte: corte 28 y pago 29 en un febrero de 28 días vence
 * el 29 de marzo (decidido el 2026-09-29).
 */
export function computePaymentDueDate(statement: LocalDate, rule: PaymentDueRule): LocalDate {
  assertPaymentDueRule(rule);
  if (rule.kind === 'DAYS_AFTER_STATEMENT') return statement.plusDays(rule.days);

  const sameMonth = statement.withDayOfMonth(rule.day);
  return sameMonth.isAfter(statement) ? sameMonth : statementInMonth(statement, 1, rule.day);
}

/** Ese día, ajustado al último del mes, `months` meses después del mes de `date`. */
function statementInMonth(date: LocalDate, months: number, day: number): LocalDate {
  return date.withDayOfMonth(1).plusMonths(months).withDayOfMonth(day);
}

function isDayOfMonth(day: number): boolean {
  return isWithin(day, MAX_DAY_OF_MONTH);
}

function isWithin(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}
