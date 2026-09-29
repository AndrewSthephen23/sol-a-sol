import { describeValue } from '../errors/describe-value.js';
import { DomainError } from '../errors/domain-error.js';
import { type Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import { computeBillingCycle, nextBillingCycle } from './billing-cycle.js';

/**
 * Compras en cuotas, decididas con el autor el 2026-09-29 (`docs/modules/credit-cards.md`).
 *
 * - La compra **entera** es gasto el día que se compra (decisión 6): las cuotas solo reparten
 *   cuánto se paga en cada estado de cuenta.
 * - Se registra el **total que da el banco**; lo que pasa del precio es interés (decisión 7).
 * - La primera cuota va en el estado de cuenta del ciclo de la compra, y cada una en el siguiente;
 *   las pendientes se calculan por fecha, no se marcan a mano (decisión 8).
 */

/** Cuotas por compra: de 2 a 36 (decidido el 2026-09-29). Una sola cuota es una compra normal. */
export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 36;

export interface Installment {
  /** Desde 1. */
  readonly number: number;
  readonly amount: Money;
  /** El estado de cuenta en el que se factura. */
  readonly statementDate: LocalDate;
}

export interface InstallmentPlanRequest {
  /** Lo que se paga en total, intereses incluidos: el que da el banco. */
  readonly total: Money;
  readonly count: number;
  readonly statementDay: number;
  readonly purchaseDate: LocalDate;
}

export class InvalidInstallmentCountError extends DomainError {
  readonly code = 'INSTALLMENT_COUNT_INVALID';

  constructor(count: number) {
    super(
      `An installment plan has ${String(MIN_INSTALLMENTS)} to ${String(MAX_INSTALLMENTS)} installments: got ${describeValue(count)}.`,
    );
  }
}

export class InstallmentTooSmallError extends DomainError {
  readonly code = 'INSTALLMENT_TOO_SMALL';

  constructor(total: string, count: number) {
    super(`${total} cannot be split in ${String(count)} installments of at least one cent.`);
  }
}

export class InstallmentTotalBelowPriceError extends DomainError {
  readonly code = 'INSTALLMENT_TOTAL_BELOW_PRICE';

  constructor() {
    super('The total to pay in installments cannot be less than the price.');
  }
}

/**
 * Reparte el total en cuotas con `allocate`: suman **exactamente** el total y los céntimos que
 * sobran van a las primeras (S/ 100.00 en 3 → 33.34, 33.33, 33.33). Cada cuota se factura en un
 * estado de cuenta, desde el del ciclo que contiene la compra: una compra del mismo día de corte
 * entra en el estado que cierra ese día (decisión 4).
 */
export function computeInstallmentPlan(request: InstallmentPlanRequest): Installment[] {
  const { total, count, statementDay, purchaseDate } = request;
  assertInstallmentCount(count);
  const amounts = total.allocate(count);
  if (amounts.some((amount) => !amount.isPositive())) {
    throw new InstallmentTooSmallError(total.toFixed(), count);
  }

  let cycle = computeBillingCycle(statementDay, purchaseDate);
  return amounts.map((amount, index) => {
    if (index > 0) cycle = nextBillingCycle(statementDay, cycle);
    return { number: index + 1, amount, statementDate: cycle.end };
  });
}

/**
 * Las cuotas que todavía no se facturan. El estado de cuenta que cierra hoy ya lleva su cuota: la
 * compra del día de corte también entra en él.
 */
export function pendingInstallments(plan: readonly Installment[], today: LocalDate): Installment[] {
  return plan.filter((installment) => installment.statementDate.isAfter(today));
}

/** El interés de una compra en cuotas: el total que da el banco menos el precio (decisión 7). */
export function installmentInterest(price: Money, total: Money): Money {
  const interest = total.subtract(price);
  if (interest.isNegative()) throw new InstallmentTotalBelowPriceError();
  return interest;
}

function assertInstallmentCount(count: number): void {
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    throw new InvalidInstallmentCountError(count);
  }
}
