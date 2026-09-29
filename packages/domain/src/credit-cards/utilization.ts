import type { Decimal } from 'decimal.js';

import { DomainError } from '../errors/domain-error.js';
import { type Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';

/**
 * Utilización de la línea y alertas de una tarjeta de crédito, decididas con el autor el
 * 2026-09-29 (`docs/modules/credit-cards.md`). Los umbrales son **fijos** en H5 (decisión 9).
 */

/** Utilización **mayor** que este porcentaje es alta (`HIGH`): justo en el 30 % todavía es `OK`. */
export const HIGH_UTILIZATION_ABOVE = 30;
/** Desde este porcentaje, **incluido**, la utilización es crítica (`CRITICAL`). */
export const CRITICAL_UTILIZATION_FROM = 70;
/** Se avisa del pago desde este número de días antes de la fecha límite, incluido. */
export const PAYMENT_ALERT_DAYS = 3;

export type UtilizationLevel = 'OK' | 'HIGH' | 'CRITICAL';

export interface Utilization {
  /** Sin redondear: se muestra con 2 decimales (`formatPercentage`). `null` con línea cero. */
  readonly percentage: Decimal | null;
  /** `null` con línea cero: sin línea no hay utilización que medir, ni alerta. */
  readonly level: UtilizationLevel | null;
}

export type PaymentAlertStatus = 'DUE_SOON' | 'OVERDUE';

export interface PaymentAlert {
  readonly status: PaymentAlertStatus;
  /** Días hasta la fecha límite: 0 el mismo día, negativo si ya venció. */
  readonly daysLeft: number;
}

export class NegativeCreditLimitError extends DomainError {
  readonly code = 'CREDIT_LIMIT_NEGATIVE';

  constructor() {
    super('A credit limit cannot be negative.');
  }
}

/**
 * Cuánto de la línea se usa. `used` es la **deuda total** en la moneda de la línea (decisiones 1
 * y 3): lo arma quien llama con las transacciones; aquí no se sabe de ellas. La deuda en otra
 * moneda no entra: sumarla lanza `CurrencyMismatchError`, porque nunca se convierte.
 *
 * Los umbrales se comparan con el porcentaje **sin redondear**: un céntimo por encima del 30 % ya
 * es alto, aunque se muestre «30.00 %».
 */
export function computeUtilization(creditLimit: Money, used: Money): Utilization {
  if (creditLimit.isNegative()) throw new NegativeCreditLimitError();
  const percentage = used.percentageOf(creditLimit);
  if (percentage === null) return { percentage: null, level: null };
  return { percentage, level: utilizationLevel(percentage) };
}

/**
 * Si hay que avisar del pago de un estado de cuenta: cuando todavía se debe algo de él y la fecha
 * límite está a `PAYMENT_ALERT_DAYS` días o menos, o ya pasó. Pagado (cero o menos por pagar,
 * decisión 10) no hay aviso.
 */
export function paymentAlert(
  today: LocalDate,
  dueDate: LocalDate,
  amountDue: Money,
): PaymentAlert | null {
  if (!amountDue.isPositive()) return null;
  const daysLeft = today.daysUntil(dueDate);
  if (daysLeft < 0) return { status: 'OVERDUE', daysLeft };
  if (daysLeft <= PAYMENT_ALERT_DAYS) return { status: 'DUE_SOON', daysLeft };
  return null;
}

function utilizationLevel(percentage: Decimal): UtilizationLevel {
  if (percentage.greaterThanOrEqualTo(CRITICAL_UTILIZATION_FROM)) return 'CRITICAL';
  if (percentage.greaterThan(HIGH_UTILIZATION_ABOVE)) return 'HIGH';
  return 'OK';
}
